"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { z } from "zod";
import { api } from "@/lib/client-api";
import { Button } from "./ui/button";
const statusSchema = z.object({
  book: z.object({
    status: z.string(),
    processingError: z.string().optional(),
  }),
  progress: z
    .object({
      stage: z.string(),
      pagesDone: z.number(),
      totalPages: z.number(),
    })
    .nullable(),
});
export function ProcessingStatus({
  id,
  initialStatus,
  initialError,
}: {
  id: string;
  initialStatus: string;
  initialError?: string;
}) {
  const [data, setData] = useState<z.infer<typeof statusSchema>>({
    book: { status: initialStatus, processingError: initialError },
    progress: null,
  });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const router = useRouter();
  useEffect(() => {
    let live = true;
    let timer: ReturnType<typeof setTimeout>;
    const controller = new AbortController();
    async function poll() {
      try {
        const next = await api(`/api/books/${id}/processing`, statusSchema, {
          signal: controller.signal,
        });
        if (!live) return;
        setData(next);
        setError("");
        if (next.book.status === "ready") {
          router.refresh();
          return;
        }
        if (next.book.status === "uploading") {
          try {
            await api(
              `/api/books/${id}/confirm`,
              z.object({ id: z.string() }),
              { method: "POST", signal: controller.signal },
            );
          } catch {
            /* Wait for verified completion; unfinished uploads expire. */
          }
        }
      } catch (err) {
        if (live)
          setError(
            err instanceof Error ? err.message : "Status is unavailable.",
          );
      }
      if (live) timer = setTimeout(poll, 2500);
    }
    void poll();
    return () => {
      live = false;
      clearTimeout(timer);
      controller.abort();
    };
  }, [id, router]);
  async function retry() {
    setBusy(true);
    try {
      await api(`/api/books/${id}/retry`, z.object({ id: z.string() }), {
        method: "POST",
      });
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Retry failed.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="progress-box" aria-live="polite">
      <h2>
        {data.book.status === "failed"
          ? "This book needs another look."
          : data.book.status === "uploading"
            ? "Waiting for your upload"
            : "Finding the words…"}
      </h2>
      <p>
        {data.book.processingError ||
          data.progress?.stage ||
          "Your work is saved. You can safely reload this page."}
      </p>
      {data.progress && data.progress.totalPages > 0 ? (
        <>
          <progress
            max={data.progress.totalPages}
            value={data.progress.pagesDone}
            aria-label="Pages extracted"
          />
          <p>
            {data.progress.pagesDone} of {data.progress.totalPages} pages
            extracted
          </p>
        </>
      ) : null}
      {data.book.status === "uploading" ? (
        <p>
          Unfinished uploads expire after 30 minutes and release their book
          slot.
        </p>
      ) : null}
      {error ? <p className="error-message">{error}</p> : null}
      {data.book.status === "failed" ? (
        <Button onClick={retry} disabled={busy}>
          {busy ? "Retrying…" : "Retry processing"}
        </Button>
      ) : null}
    </section>
  );
}
