// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { act, renderHook, cleanup } from "@testing-library/react";
import { StrictMode, type ReactNode } from "react";
import { useVoice } from "../../hooks/use-voice";
type FixtureSdk = {
  emit: (name: string, payload?: unknown) => boolean;
  listenerCount: (name: string) => number;
  stop: ReturnType<typeof vi.fn>;
};
const fixture = vi.hoisted(() => ({ clients: [] as FixtureSdk[] }));
vi.mock("@vapi-ai/web", async () => {
  const { EventEmitter } = await import("node:events");
  class SDK extends EventEmitter {
    stop = vi.fn(async () => {});
    constructor() {
      super();
      fixture.clients.push(this);
    }
    async reconnect() {
      this.emit("call-start");
    }
  }
  return { default: SDK };
});
beforeEach(() => {
  fixture.clients.length = 0;
  vi.useFakeTimers();
  vi.stubGlobal("isSecureContext", true);
  Object.defineProperty(navigator, "mediaDevices", {
    configurable: true,
    value: {
      getUserMedia: vi.fn(async () => ({
        getTracks: () => [{ stop: vi.fn() }],
      })),
    },
  });
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      if (url.endsWith("/sessions"))
        return Response.json({
          sessionId: "session-fixture",
          id: "call-fixture",
          webCallUrl: "https://fixture.daily.co/join",
          maxDurationSeconds: 300,
        });
      if (init?.method === "POST") return Response.json({ stopping: true });
      return Response.json({
        status: "active",
        maxDurationSeconds: 300,
        references: [],
      });
    }),
  );
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});
it("Strict Mode creates no call until requested and unmount removes listeners and stops once", async () => {
  const wrapper = ({ children }: { children: ReactNode }) => (
    <StrictMode>{children}</StrictMode>
  );
  const { result, unmount } = renderHook(() => useVoice("book-fixture", 300), {
    wrapper,
  });
  expect(fixture.clients).toHaveLength(0);
  await act(async () => result.current.start());
  expect(fixture.clients).toHaveLength(1);
  expect(result.current.state).toBe("listening");
  const sdk = fixture.clients[0];
  act(() => {
    sdk.emit("message", {
      type: "transcript",
      role: "user",
      transcriptType: "final",
      transcript: "Unique fact?",
      id: "one",
    });
    sdk.emit("message", {
      type: "transcript",
      role: "user",
      transcriptType: "final",
      transcript: "Unique fact?",
      id: "one",
    });
  });
  expect(result.current.messages).toHaveLength(1);
  unmount();
  expect(sdk.listenerCount("message")).toBe(0);
  expect(sdk.stop).toHaveBeenCalledTimes(1);
});
it("stops once at the duration limit and clears the elapsed timer", async () => {
  const { result } = renderHook(() => useVoice("book-fixture", 300));
  await act(async () => result.current.start());
  const sdk = fixture.clients[0];
  await act(async () => {
    vi.advanceTimersByTime(301000);
  });
  expect(sdk.stop).toHaveBeenCalledTimes(1);
  expect(result.current.state).toBe("idle");
  const elapsed = result.current.elapsed;
  await act(async () => {
    vi.advanceTimersByTime(10000);
  });
  expect(result.current.elapsed).toBe(elapsed);
});
it("microphone denial never reserves a provider call", async () => {
  Object.defineProperty(navigator, "mediaDevices", {
    configurable: true,
    value: {
      getUserMedia: vi.fn(async () => {
        throw new DOMException("denied", "NotAllowedError");
      }),
    },
  });
  const { result } = renderHook(() => useVoice("book-fixture", 300));
  await act(async () => result.current.start());
  expect(result.current.state).toBe("error");
  expect(result.current.error).toContain("denied");
  expect(fetch).not.toHaveBeenCalled();
  expect(fixture.clients).toHaveLength(0);
});
it("provider errors clear listeners, finalize once and allow a clean restart", async () => {
  const { result } = renderHook(() => useVoice("book-fixture", 300));
  await act(async () => result.current.start());
  const first = fixture.clients[0];
  await act(async () => {
    first.emit("error", new Error("fixture disconnect"));
  });
  expect(result.current.state).toBe("error");
  expect(result.current.error).toContain("connection");
  expect(first.stop).toHaveBeenCalledTimes(1);
  expect(first.listenerCount("message")).toBe(0);
  await act(async () => result.current.start());
  expect(fixture.clients).toHaveLength(2);
  expect(result.current.state).toBe("listening");
  expect(result.current.messages).toEqual([]);
  await act(async () => result.current.stop());
  expect(fixture.clients[1].stop).toHaveBeenCalledTimes(1);
});
