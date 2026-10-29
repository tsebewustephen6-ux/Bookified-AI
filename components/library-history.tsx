"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowRight, Clock, MessageSquare, BookOpen, RotateCw } from "lucide-react";
import type { LibraryConversationItem } from "@/lib/sessions";
import { Button } from "@/components/ui/button";

export function LibraryHistory({
  initialItems,
  initialNextCursor,
}: {
  initialItems: LibraryConversationItem[];
  initialNextCursor: string | null;
}) {
  const [items, setItems] = useState<LibraryConversationItem[]>(initialItems);
  const [nextCursor, setNextCursor] = useState<string | null>(initialNextCursor);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function loadMore() {
    if (!nextCursor || loading) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/sessions?cursor=${encodeURIComponent(nextCursor)}`);
      if (!res.ok) throw new Error("Could not load older conversations.");
      const data = await res.json();
      setItems((prev) => [...prev, ...data.items]);
      setNextCursor(data.nextCursor);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load older conversations.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="library-history-section" aria-label="Reading conversation history">
      <div className="section-heading">
        <div>
          <p className="eyebrow">YOUR CONVERSATION ARCHIVE</p>
          <h2>All book conversations</h2>
        </div>
      </div>
      <p className="section-subheading">
        Every discussion grounded in your uploaded books, preserved across sessions.
      </p>

      {items.length === 0 ? (
        <div className="empty-state history-empty-state">
          <MessageSquare size={32} className="text-[var(--muted)]" aria-hidden />
          <h3>No conversations yet</h3>
          <p>
            Open any ready book from your bookshelf above and start talking to explore its contents.
          </p>
        </div>
      ) : (
        <>
          <div className="library-history-grid">
            {items.map((item) => {
              const book = item.book;
              const bookHref = book ? `/books/${book.slug}` : "#";
              const durationMins = Math.ceil(item.durationSeconds / 60);

              return (
                <article key={item.id} className="library-history-card">
                  <div className="history-card-header">
                    <div className="history-book-badge">
                      <BookOpen size={14} className="text-[var(--accent)]" aria-hidden />
                      {book ? (
                        <Link href={bookHref} className="history-book-title font-medium hover:underline">
                          {book.title}
                        </Link>
                      ) : (
                        <span className="history-book-title text-[var(--muted)]">Unknown book</span>
                      )}
                    </div>
                    <time dateTime={item.date} className="history-date">
                      {new Date(item.date).toLocaleDateString(undefined, {
                        month: "short",
                        day: "numeric",
                        year: "numeric",
                      })}
                    </time>
                  </div>

                  <div className="history-card-body">
                    <h3 className="history-topic">
                      {item.name || item.preview || "New conversation"}
                    </h3>
                    {item.preview ? (
                      <p className="history-preview-snippet">
                        “{item.preview}”
                      </p>
                    ) : (
                      <p className="history-preview-snippet italic text-[var(--muted)]">
                        No recorded transcript for this call.
                      </p>
                    )}
                  </div>

                  <div className="history-card-footer">
                    <div className="history-meta-group">
                      <span className="history-duration">
                        <Clock size={13} aria-hidden />
                        {durationMins > 0 ? `${durationMins} min` : "Quick call"}
                      </span>
                      <span className={"status-pill status-" + item.status}>
                        {item.status === "active" || item.status === "reserved"
                          ? "In progress"
                          : item.hasTranscript
                          ? "Saved"
                          : "Ended"}
                      </span>
                    </div>

                    {book ? (
                      <Button asChild variant="outline" size="sm" className="history-open-btn">
                        <Link href={bookHref}>
                          Open book
                          <ArrowRight size={13} />
                        </Link>
                      </Button>
                    ) : null}
                  </div>
                </article>
              );
            })}
          </div>

          {error ? <p role="alert" className="error-message text-center mt-4">{error}</p> : null}

          {nextCursor ? (
            <div className="history-load-more">
              <Button
                type="button"
                variant="outline"
                disabled={loading}
                onClick={loadMore}
                className="gap-2"
              >
                {loading ? <RotateCw className="w-4 h-4 animate-spin" /> : null}
                {loading ? "Loading older discussions…" : "Load older conversations"}
              </Button>
            </div>
          ) : null}
        </>
      )}
    </section>
  );
}
