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
  const controls = useRef<HTMLDivElement>(null);
  const picker = useRef<HTMLDialogElement>(null);
  const [expanded, setExpanded] = useState(true);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [active, setActive] = useState(false); const wasActive = useRef(false);
  useEffect(() => { if (wasActive.current && !active) void refresh(); wasActive.current = active; }, [active, refresh]);
  useEffect(() => {
    const media = matchMedia('(min-width: 1001px)');
    const resized = () => { if (media.matches) picker.current?.close(); };
    media.addEventListener('change', resized);
    return () => media.removeEventListener('change', resized);
  }, []);
  function focusControls() {
    picker.current?.close();
    requestAnimationFrame(() => { controls.current?.focus({ preventScroll: true }); controls.current?.scrollIntoView({ block: 'start', behavior: 'auto' }); });
  }
  async function select(id: string) { if (await saved.select(id)) focusControls(); }
  function fresh() { saved.fresh(); focusControls(); }
  function history(prefix: string) {
    return <>
      <h2>Saved conversations</h2>
      <p>Return to a discussion whenever you are ready.</p>
      <div className="conversation-actions">
        <button type="button" className="button button-primary" disabled={active || saved.loading} onClick={fresh}>New conversation</button>
        <button type="button" className="button button-outline" disabled={active || saved.loading} onClick={() => void refresh()}>Refresh saved conversations</button>
      </div>
      {saved.loading ? <p role="status">Loading conversations…</p> : null}
      {saved.error ? <p role="alert" className="error-message">{saved.error}</p> : null}
      {!saved.loading && !saved.error && !saved.history.items.length ? <p>No saved conversations yet.</p> : null}
      {saved.history.items.map(item => <article key={item.id} className={'conversation-history-item' + (item.id === saved.selected?.id ? ' selected' : '')}>
        <button type="button" className="conversation-history-select" aria-label={item.id === saved.selected?.id ? 'Selected conversation' : 'View and continue conversation'} aria-describedby={`${prefix}-${item.id}-name ${prefix}-${item.id}-date`} aria-pressed={item.id === saved.selected?.id} disabled={active || saved.loading || !item.hasTranscript || ['active', 'reserved'].includes(item.status)} onClick={() => void select(item.id)}>
          <strong id={`${prefix}-${item.id}-name`}>{item.name || item.preview || 'New conversation'}</strong>
          <time id={`${prefix}-${item.id}-date`} dateTime={item.date}>{new Date(item.date).toLocaleString()}</time>
          <span className="conversation-meta">{Math.ceil(item.durationSeconds / 60)} min · {['active', 'reserved'].includes(item.status) ? 'Call in progress' : item.hasTranscript ? 'Saved conversation' : 'No saved transcript'}{item.id === saved.selected?.id ? ' · Selected' : ''}</span>
        </button>
      </article>)}
      {saved.history.nextCursor ? <button type="button" className="button button-outline" disabled={active || saved.loading} onClick={() => void refresh(saved.history.nextCursor!)}>Older conversations</button> : null}
    </>;
  }
  return <div className={'conversation-layout' + (expanded ? '' : ' sidebar-collapsed')}>
    {expanded ? <aside className="conversation-history conversation-desktop-history" aria-label="Saved conversations">{history('desktop')}</aside> : null}
    <div ref={controls} tabIndex={-1} className="conversation-main">
      <div className="conversation-actions conversation-toolbar">
        <button type="button" className="button button-outline conversation-desktop-toggle" aria-expanded={expanded} onClick={() => setExpanded(value => !value)}>{expanded ? 'Hide conversations' : 'Show conversations'}</button>
        <button type="button" className="button button-outline conversation-mobile-toggle" aria-haspopup="dialog" aria-expanded={mobileOpen} onClick={() => { picker.current?.showModal(); setMobileOpen(true); }}>Conversations</button>
      </div>
      <section className="conversation-context">
        <h2>{saved.history.items.find(item => item.id === saved.selected?.id)?.name || (saved.selected ? 'Your saved conversation' : 'New conversation')}</h2>
        <p role="status">{saved.selected ? 'Continuing a saved conversation' : 'Starting from the beginning'}. Each new call has its own plan time limit.</p>
        <p>Your saved text stays here after a call ends or your monthly usage resets.</p>
        <div className="conversation-actions">
          {saved.latest && saved.latest.id !== saved.selected?.id ? <button type="button" className="button button-primary" disabled={active || saved.loading} onClick={() => void select(saved.latest!.id)}>Continue latest conversation</button> : null}
          <button type="button" className="button button-outline" disabled={active || saved.loading} onClick={fresh}>Start from beginning</button>
        </div>
        {saved.loading ? <p role="status">Loading conversations…</p> : null}
        {saved.error ? <p role="alert" className="error-message">{saved.error}</p> : null}
      </section>
      <LiveConversation key={props.bookId + ':' + saved.revision} {...props} selectionPending={saved.loading} resumeFrom={saved.selected?.id} savedMessages={saved.selected?.messages} onActiveChange={setActive} />
    </div>
    <dialog ref={picker} className="conversation-picker" aria-label="Saved conversations" onClose={() => setMobileOpen(false)}>
      <button type="button" autoFocus className="button button-outline" onClick={() => picker.current?.close()}>Close conversations</button>
      <section className="conversation-history">{history('picker')}</section>
    </dialog>
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
        {!call.active && (resumeFrom || call.elapsed > 0) ? <p className="conversation-resume" role="status">{call.elapsed > 0 ? 'This call has ended. ' : ''}Press the microphone to continue the discussion with a new time limit.</p> : null}
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
