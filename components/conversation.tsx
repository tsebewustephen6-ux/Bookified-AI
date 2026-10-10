"use client";
import { useEffect, useRef, useState } from "react";
import { Mic, Square, Headphones } from "lucide-react";
import { useVoice } from "@/hooks/use-voice";
import { useConversationHistory } from '@/hooks/use-conversation-history';
import type { SavedTurn } from '@/lib/conversation-history';
function time(seconds: number) {
  return `${Math.floor(seconds / 60)
    .toString()
    .padStart(2, "0")}:${(seconds % 60).toString().padStart(2, "0")}`;
}
export function Conversation(props: { bookId: string; limit: number; voiceName: string }) {
  const saved = useConversationHistory(props.bookId);
  const refresh = saved.refresh;
  const [active, setActive] = useState(false); const wasActive = useRef(false);
  useEffect(() => { if (wasActive.current && !active) void refresh(); wasActive.current = active; }, [active, refresh]);
  return <div>
    <section className="voice-console" style={{ marginBottom: 20 }}>
      <h2>Your conversations</h2>
      <p>{saved.selected ? 'Continuing a saved conversation' : 'Starting from the beginning'}. Each new call has its own plan time limit.</p>
      <button type="button" className="btn btn-secondary" disabled={active || saved.loading} onClick={saved.fresh}>Start from beginning</button>{' '}
      <button type="button" className="btn btn-secondary" disabled={active || saved.loading} onClick={() => void saved.refresh()}>Refresh saved conversations</button>
      {saved.loading ? <p role="status">Loading conversations…</p> : null}
      {saved.error ? <p role="alert" className="error-message">{saved.error}</p> : null}
    </section>
    <LiveConversation key={`${props.bookId}:${saved.revision}`} {...props} selectionPending={saved.loading} resumeFrom={saved.selected?.id} savedMessages={saved.selected?.messages} onActiveChange={setActive} />
    <section className="voice-console" style={{ marginTop: 20 }}><h2>Saved sessions</h2>
      {!saved.loading && !saved.error && !saved.history.items.length ? <p>No saved conversations yet.</p> : null}
      {saved.history.items.map(item => <article key={item.id} style={{ marginTop: 16 }}>
        <p>{new Date(item.date).toLocaleString()} · {Math.ceil(item.durationSeconds / 60)} min · {item.status}</p>
        <p>{item.preview || 'No saved text is available for this session.'}</p>
        <button type="button" className="btn btn-secondary" disabled={active || saved.loading || !item.hasTranscript || ['active', 'reserved'].includes(item.status)} onClick={() => void saved.select(item.id)}>View and continue conversation</button>
      </article>)}
      {saved.history.nextCursor ? <button type="button" className="btn btn-secondary" disabled={active || saved.loading} onClick={() => void saved.refresh(saved.history.nextCursor!)}>Older conversations</button> : null}
    </section>
  </div>;
}
function LiveConversation({
  bookId,
  limit,
  voiceName,
  resumeFrom, savedMessages, onActiveChange, selectionPending,
}: {
  bookId: string;
  limit: number;
  voiceName: string;
  resumeFrom?: string; savedMessages?: SavedTurn[]; onActiveChange: (active: boolean) => void;
  selectionPending: boolean;
}) {
  const call = useVoice(bookId, limit, undefined, { resumeFrom, messages: savedMessages });
  useEffect(() => { onActiveChange(call.active); }, [call.active, onActiveChange]);
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
          {call.state === "idle" ? "Ready when you are" : call.state} ·{" "}
          {voiceName}
        </p>
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
