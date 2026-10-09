"use client";
import { useEffect, useRef, useState } from "react";
import type Vapi from "@vapi-ai/web";
import { z } from "zod";
import { api, ApiError } from "../lib/client-api";
import { appendTranscript, type TranscriptMessage } from "../lib/transcripts";
export type VoiceState =
  | "idle"
  | "connecting"
  | "starting"
  | "listening"
  | "thinking"
  | "speaking"
  | "stopping"
  | "error";
const admissionSchema = z.object({
  sessionId: z.string(),
  id: z.string(),
  webCallUrl: z.string().url(),
  maxDurationSeconds: z.number().positive(),
});
const statusSchema = z.object({
  status: z.string(),
  startedAt: z.string().optional(),
  maxDurationSeconds: z.number(),
  references: z.array(
    z.object({
      segmentId: z.string().optional(),
      pageStart: z.number().optional(),
      pageEnd: z.number().optional(),
    }),
  ),
});
export function useVoice(bookId: string, limit: number, request: typeof api = api) {
  const [state, setState] = useState<VoiceState>("idle");
  const [error, setError] = useState("");
  const [messages, setMessages] = useState<TranscriptMessage[]>([]);
  const [elapsed, setElapsed] = useState(0);
  const [maxDuration, setMaxDuration] = useState(limit);
  const [references, setReferences] = useState<
    z.infer<typeof statusSchema>["references"]
  >([]);
  const client = useRef<Vapi | null>(null);
  const sessionId = useRef("");
  const running = useRef(false);
  const stopping = useRef(false);
  const generation = useRef(0);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const pollTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const timeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const started = useRef(0);
  const admissionKey = useRef<string | null>(null);
  function clearTimers() {
    if (timer.current) clearInterval(timer.current);
    if (pollTimer.current) clearTimeout(pollTimer.current);
    if (timeout.current) clearTimeout(timeout.current);
    timer.current = null;
    pollTimer.current = null;
    timeout.current = null;
  }
  async function finish(reportError?: string) {
    if (stopping.current) return;
    stopping.current = true;
    generation.current++;
    clearTimers();
    running.current = false;
    const sdk = client.current;
    client.current = null;
    sdk?.removeAllListeners();
    if (sdk) await Promise.resolve(sdk.stop()).catch(() => {});
    if (sessionId.current) {
      admissionKey.current = null;
      try {
        await request(
          `/api/sessions/${sessionId.current}`,
          z.object({ stopping: z.boolean() }),
          { method: "POST" },
        );
      } catch {
        reportError ||=
          "The provider is confirming the end of your call. Wait a moment before restarting.";
      }
    }
    sessionId.current = "";
    stopping.current = false;
    setState(reportError ? "error" : "idle");
    if (reportError) setError(reportError);
  }
  useEffect(
    () => () => {
      generation.current++;
      running.current = false;
      if (timer.current) clearInterval(timer.current);
      if (pollTimer.current) clearTimeout(pollTimer.current);
      if (timeout.current) clearTimeout(timeout.current);
      const sdk = client.current;
      client.current = null;
      sdk?.removeAllListeners();
      if (sdk) void Promise.resolve(sdk.stop()).catch(() => {});
      if (sessionId.current)
        void request(`/api/sessions/${sessionId.current}`, z.object({ stopping: z.boolean() }), {
          method: "POST",
          keepalive: true,
        }).catch(() => {});
    },
    [bookId, request],
  );
  async function start() {
    if (running.current || stopping.current) return;
    running.current = true;
    const attempt = ++generation.current;
    setError("");
    setState("connecting");
    setMessages([]);
    setReferences([]);
    setElapsed(0);
    try {
      if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia)
        throw new Error(
          "Use HTTPS or localhost in a browser with microphone support.",
        );
      const permission = await navigator.mediaDevices.getUserMedia({
        audio: true,
      });
      permission.getTracks().forEach((track) => track.stop());
      if (attempt !== generation.current) return;
      const admission = await request(
        `/api/books/${bookId}/sessions`,
        admissionSchema,
        {
          method: "POST",
          body: JSON.stringify({
            idempotencyKey: (admissionKey.current ||= crypto.randomUUID()),
          }),
        },
      );
      if (attempt !== generation.current) {
          void request(`/api/sessions/${admission.sessionId}`, z.object({ stopping: z.boolean() }), {
          method: "POST",
          keepalive: true,
        }).catch(() => {});
        return;
      }
      sessionId.current = admission.sessionId;
      setMaxDuration(admission.maxDurationSeconds);
      const { default: VapiSDK } = await import("@vapi-ai/web");
      if (attempt !== generation.current) return;
      const sdk = new VapiSDK("");
      client.current = sdk;
      setState("starting");
      const live = () => attempt === generation.current;
      sdk.on("call-start", () => {
        if (!live()) return;
        if (timeout.current) clearTimeout(timeout.current);
        started.current = Date.now();
        setState("listening");
        timer.current = setInterval(() => {
          if (!live()) return;
          const seconds = Math.floor((Date.now() - started.current) / 1000);
          setElapsed(seconds);
          if (seconds >= admission.maxDurationSeconds) {
            setState("stopping");
            void finish();
          }
        }, 500);
      });
      sdk.on("speech-start", () => {
        if (live()) setState("speaking");
      });
      sdk.on("speech-end", () => {
        if (live()) setState("listening");
      });
      sdk.on("message", (message: unknown) => {
        if (!live()) return;
        setMessages((current) => appendTranscript(current, message));
        const parsed = z
          .object({
            type: z.string(),
            role: z.string().optional(),
            transcriptType: z.string().optional(),
            status: z.string().optional(),
          })
          .safeParse(message);
        if (
          parsed.success &&
          parsed.data.type === "transcript" &&
          parsed.data.role === "user" &&
          parsed.data.transcriptType === "final"
        )
          setState("thinking");
      });
      sdk.on("call-end", () => {
        if (live()) void finish();
      });
      sdk.on("error", () => {
        if (live())
          void finish(
            "Voice connection interrupted. Check your microphone and connection, then try again.",
          );
      });
      sdk.on("call-start-failed", () => {
        if (live())
          void finish("The conversation could not connect. Please try again.");
      });
      timeout.current = setTimeout(() => {
        if (live())
          void finish(
            "Connection timed out. Check your network and try again.",
          );
      }, 30000);
      async function poll() {
        if (!live()) return;
        try {
          const status = await request(
            `/api/sessions/${admission.sessionId}`,
            statusSchema,
          );
          if (!live()) return;
          setReferences(status.references);
          if (status.startedAt)
            started.current = new Date(status.startedAt).getTime();
          if (["ended", "failed", "expired"].includes(status.status)) {
            void finish();
            return;
          }
        } catch {
          /* SDK errors remain actionable; worker reconciles provider outages. */
        }
        if (live()) pollTimer.current = setTimeout(poll, 5000);
      }
      await sdk.reconnect({
        id: admission.id,
        webCallUrl: admission.webCallUrl,
      });
      if (live()) void poll();
    } catch (err) {
      if (err instanceof ApiError && err.code === "CALL_REJECTED")
        admissionKey.current = null;
      if (attempt === generation.current) {
        const details = z
          .object({
            name: z.string().optional(),
            message: z.string().optional(),
          })
          .safeParse(err);
        await finish(
          details.success && details.data.name === "NotAllowedError"
            ? "Microphone access was denied. Allow it in browser settings, then try again."
            : details.success && details.data.name === "NotFoundError"
              ? "No microphone was found. Connect a microphone and try again."
              : details.success && details.data.message
                ? details.data.message
                : "Voice could not connect.",
        );
      }
    }
  }
  return {
    state,
    error,
    messages,
    elapsed,
    maxDuration,
    references,
    start,
    stop: async () => {
      setState("stopping");
      await finish();
    },
    active: state !== "idle" && state !== "error",
  };
}
