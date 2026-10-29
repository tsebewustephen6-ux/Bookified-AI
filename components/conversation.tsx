"use client";

import { useEffect, useRef, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import {
  Mic,
  Square,
  Headphones,
  RotateCw,
  Plus,
  MessageSquare,
} from "lucide-react";
import { useVoice } from "@/hooks/use-voice";
import { useConversationHistory } from "@/hooks/use-conversation-history";
import type { SavedTurn } from "@/lib/conversation-history";
import { Button } from "@/components/ui/button";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { cn } from "@/lib/utils";

function time(seconds: number) {
  return `${Math.floor(seconds / 60)
    .toString()
    .padStart(2, "0")}:${(seconds % 60).toString().padStart(2, "0")}`;
}

export function Conversation(props: {
  bookId: string;
  limit: number;
  voiceName: string;
}) {
  const saved = useConversationHistory(props.bookId);
  const refresh = saved.refresh;
  const controls = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(false);
  const wasActive = useRef(false);

  const searchParams = useSearchParams();
  const router = useRouter();
  const sessionId = searchParams?.get("session") || null;

  // React to URL ?session=... selection from the AppSidebar
  useEffect(() => {
    if (sessionId && sessionId !== saved.selected?.id) {
      void saved.select(sessionId);
    } else if (!sessionId && saved.selected) {
      saved.fresh();
    }
  }, [sessionId, saved]);

  // When call stops, trigger history refresh and notify AppSidebar
  useEffect(() => {
    if (wasActive.current && !active) {
      void refresh();
      window.dispatchEvent(new CustomEvent("bookified:conversation-updated"));
    }
    wasActive.current = active;
  }, [active, refresh]);

  // Handle external deletion from the sidebar
  useEffect(() => {
    const onDeleted = (e: Event) => {
      const customEvent = e as CustomEvent<{ id: string }>;
      if (customEvent.detail?.id === saved.selected?.id) {
        saved.fresh();
      }
      void refresh();
    };
    window.addEventListener("bookified:conversation-deleted", onDeleted);
    return () =>
      window.removeEventListener("bookified:conversation-deleted", onDeleted);
  }, [saved, refresh]);

  function focusControls() {
    requestAnimationFrame(() => {
      controls.current?.focus({ preventScroll: true });
      controls.current?.scrollIntoView({ block: "start", behavior: "auto" });
    });
  }

  async function select(id: string) {
    if (await saved.select(id)) {
      focusControls();
      const currentUrl = new URL(window.location.href);
      currentUrl.searchParams.set("session", id);
      router.replace(currentUrl.pathname + currentUrl.search);
    }
  }

  function fresh() {
    saved.fresh();
    focusControls();
    if (sessionId) {
      const currentUrl = new URL(window.location.href);
      currentUrl.searchParams.delete("session");
      router.replace(currentUrl.pathname);
    }
  }

  const selectedName =
    saved.history.items.find((item) => item.id === saved.selected?.id)?.name ||
    "Saved discussion";

  return (
    <div
      ref={controls}
      tabIndex={-1}
      className="conversation-main-content w-full flex flex-col gap-4"
    >
      {/* Top action toolbar integrated with ChatGPT/Claude style sidebar trigger */}
      <div className="conversation-toolbar-bar flex items-center justify-between gap-3 p-3 bg-[#fffdfa] border border-[var(--border,#e2dcd1)] rounded-xl shadow-2xs">
        <div className="flex items-center gap-2.5 min-w-0">
          <SidebarTrigger
            className="text-[var(--muted,#777064)] hover:text-[var(--foreground,#302b26)] hover:bg-[var(--sidebar-accent,#ede7dc)]"
            title="Toggle conversation history"
          />
          <span className="text-xs font-medium text-[var(--muted,#777064)]">
            {saved.selected
              ? "Continuing discussion"
              : "Fresh discussion"}
          </span>
          {saved.selected ? (
            <span className="text-xs text-[var(--accent,#765747)] font-medium bg-[var(--accent,#765747)]/10 px-2.5 py-0.5 rounded-full truncate max-w-[260px]">
              {selectedName}
            </span>
          ) : null}
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {saved.selected ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={active || saved.loading}
              onClick={fresh}
              className="text-xs h-7 px-2.5 gap-1.5"
            >
              <Plus className="w-3.5 h-3.5" />
              Start fresh
            </Button>
          ) : null}
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={active || saved.loading}
            onClick={() => void refresh()}
            className="text-xs h-7 px-2 text-[var(--muted,#777064)]"
            title="Refresh saved conversations"
          >
            <RotateCw
              className={cn("w-3.5 h-3.5", saved.loading && "animate-spin")}
            />
          </Button>
        </div>
      </div>

      <section className="conversation-context">
        <h2>
          {saved.selected
            ? selectedName
            : "A new conversation"}
        </h2>
        <p role="status">
          {saved.selected
            ? "Continuing your saved conversation. Grounded in this book."
            : "Starting from the beginning. Each call has its own plan time limit."}
        </p>
        <p>
          Your saved text discussions are preserved privately across sessions.
        </p>
        <div className="conversation-actions">
          {saved.latest && saved.latest.id !== saved.selected?.id ? (
            <button
              type="button"
              className="button button-primary"
              disabled={active || saved.loading}
              onClick={() => void select(saved.latest!.id)}
            >
              Continue latest conversation
            </button>
          ) : null}
          {saved.selected ? (
            <button
              type="button"
              className="button button-outline"
              disabled={active || saved.loading}
              onClick={fresh}
            >
              Start from beginning
            </button>
          ) : null}
        </div>
        {saved.loading ? <p role="status">Loading conversation…</p> : null}
        {saved.error ? (
          <p role="alert" className="error-message">
            {saved.error}
          </p>
        ) : null}
      </section>

      <LiveConversation
        key={props.bookId + ":" + saved.revision}
        {...props}
        selectionPending={saved.loading}
        resumeFrom={saved.selected?.id}
        savedMessages={saved.selected?.messages}
        onActiveChange={setActive}
      />
    </div>
  );
}

function LiveConversation({
  bookId,
  limit,
  voiceName,
  resumeFrom,
  savedMessages,
  onActiveChange,
  selectionPending,
}: {
  bookId: string;
  limit: number;
  voiceName: string;
  resumeFrom?: string;
  savedMessages?: SavedTurn[];
  onActiveChange: (active: boolean) => void;
  selectionPending: boolean;
}) {
  const call = useVoice(bookId, limit, undefined, {
    resumeFrom,
    messages: savedMessages,
  });
  useEffect(() => {
    onActiveChange(call.active);
  }, [call.active, onActiveChange]);
  const scroll = useRef<HTMLDivElement>(null);
  const nearBottom = useRef(true);
  useEffect(() => {
    if (scroll.current && nearBottom.current)
      scroll.current.scrollTop = scroll.current.scrollHeight;
  }, [call.messages]);

  return (
    <div className="voice-panel">
      <section className="voice-console">
        <Headphones
          size={25}
          style={{ margin: "0 auto 15px", color: "var(--accent)" }}
          aria-hidden
        />
        <h2>A conversation with your book.</h2>
        <p className="voice-state" role="status">
          {call.state === "idle" ? "Ready when you are" : call.state} · {voiceName}
        </p>
        {!call.active && (resumeFrom || call.elapsed > 0) ? (
          <p className="conversation-resume" role="status">
            {call.elapsed > 0 ? "This call has ended. " : ""}
            Press the microphone to continue the discussion with a new time limit.
          </p>
        ) : null}
        <button
          className="mic-button"
          type="button"
          onClick={() => void (call.active ? call.stop() : call.start())}
          disabled={call.state === "stopping" || (!call.active && selectionPending)}
          aria-label={
            call.active ? "Stop conversation" : "Start microphone conversation"
          }
        >
          {call.active ? (
            <Square size={25} fill="currentColor" />
          ) : (
            <Mic size={30} />
          )}
        </button>
        <p className="timer">
          {time(call.elapsed)} / {time(call.maxDuration)}
        </p>
        {call.active && call.maxDuration - call.elapsed <= 60 ? (
          <p role="status">Your conversation ends in less than a minute.</p>
        ) : null}
        {call.error ? (
          <p className="error-message" role="alert">
            {call.error}
          </p>
        ) : null}
        <p style={{ fontSize: 12, color: "var(--muted)", marginTop: 15 }}>
          Text conversations are saved privately for this book. Audio is not recorded.
        </p>
      </section>
      <div
        className="transcript"
        ref={scroll}
        tabIndex={0}
        role="region"
        aria-label="Live conversation transcript"
        onScroll={() => {
          const el = scroll.current;
          if (el)
            nearBottom.current =
              el.scrollHeight - el.scrollTop - el.clientHeight < 80;
        }}
      >
        <h2>Between the words</h2>
        {call.messages.length ? (
          call.messages.map((message) => (
            <div
              className={`message ${message.role} ${message.final ? "" : "partial"}`}
              key={message.id}
            >
              <strong>
                {message.role === "user" ? "You" : "Bookified"}
                {!message.final ? " · in progress" : ""}
              </strong>
              <p>{message.text}</p>
            </div>
          ))
        ) : (
          <p className="transcript-empty">
            Your conversation will unfold here.
            <br />
            Start with a question, a passage, or a little curiosity.
          </p>
        )}
      </div>
      {call.references.length ? (
        <section>
          <h3 style={{ fontSize: 18, marginBottom: 10 }}>From the pages</h3>
          <div className="references">
            {call.references.map((ref, i) => (
              <span className="reference" key={ref.segmentId || i}>
                Pages {ref.pageStart}–{ref.pageEnd}
              </span>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}
