import Link from "next/link";
import { Suspense } from "react";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { currentOwner, entitlement } from "@/lib/auth";
import { connect } from "@/database/connection";
import { Book } from "@/database/models";
import { dto } from "@/lib/books";
import { plans } from "@/lib/plans";
import { voices } from "@/lib/voices";
import { BookCover } from "@/components/book-cover";
import { Conversation } from "@/components/conversation";
import { ProcessingStatus } from "@/components/processing-status";
export default async function BookPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const owner = await currentOwner();
  if (!owner) redirect("/sign-in");
  await connect();
  const book = await Book.findOne({
    ownerId: owner,
    slug: (await params).slug,
  });
  if (!book) notFound();
  const data = dto(book);
  let limit = plans.free.duration as number;
  let planError = false;
  try {
    limit = plans[await entitlement(owner)].duration;
  } catch {
    planError = true;
  }
  const selectedVoice = voices().find((v) => v.id === book.personaId);
  return (
    <>
      <Link className="text-link" href="/">
        <ArrowLeft size={16} />
        Back to Library
      </Link>
      <div className="conversation-grid">
        <aside className="book-detail">
          <BookCover {...data} />
          <h1>{data.title}</h1>
          <p>{data.author}</p>
          <span className={`status status-${data.status}`}>{data.status}</span>
          <p style={{ fontSize: 12, marginTop: 15 }}>
            {data.pageCount} pages ·{" "}
            {selectedVoice?.name || "Voice unavailable"}
          </p>
        </aside>
        {data.status !== "ready" ? (
          <ProcessingStatus
            id={data.id}
            initialStatus={data.status}
            initialError={data.processingError}
          />
        ) : planError ? (
          <div className="setup-note">
            Your plan could not be confirmed. Refresh to try again.
          </div>
        ) : !selectedVoice ? (
          <div className="setup-note">
            The selected voice is currently unavailable. Contact the application
            administrator to restore it.
          </div>
        ) : (
          <Suspense fallback={<p className="p-6 text-center text-xs text-[var(--muted)]">Opening discussion…</p>}>
            <Conversation
              key={data.id}
              bookId={data.id}
              limit={limit}
              voiceName={selectedVoice.name}
            />
          </Suspense>
        )}
      </div>
    </>
  );
}
