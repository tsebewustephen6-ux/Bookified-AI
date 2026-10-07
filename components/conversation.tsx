"use client";
import { useEffect, useRef } from "react";
import { Mic, Square, Headphones } from "lucide-react";
import { useVoice } from "@/hooks/use-voice";
function time(seconds: number) {
  return `${Math.floor(seconds / 60)
    .toString()
    .padStart(2, "0")}:${(seconds % 60).toString().padStart(2, "0")}`;
}
export function Conversation({
  bookId,
  limit,
  voiceName,
}: {
  bookId: string;
  limit: number;
  voiceName: string;
}) {
  const call = useVoice(bookId, limit);
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
          disabled={call.state === "stopping"}
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
          Use your microphone to ask about this book. Transcripts stay in this
          browser session.
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
