import Link from "next/link";
import { ArrowRight, BookOpen, Headphones, Plus, Sparkles } from "lucide-react";
import { currentOwner } from "@/lib/auth";
import { library } from "@/lib/books";
import { Button } from "@/components/ui/button";
import { LibrarySearch } from "@/components/search";
import { BookCover } from "@/components/book-cover";
export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; page?: string }>;
}) {
  const [owner, params] = await Promise.all([currentOwner(), searchParams]);
  const q = (params.q || "").slice(0, 200);
  const page = Math.max(
    1,
    Math.min(10000, Math.floor(Number(params.page) || 1)),
  );
  let result: Awaited<ReturnType<typeof library>> | undefined;
  let unavailable = false;
  if (owner) {
    try {
      result = await library(owner, q, page);
    } catch {
      unavailable = true;
    }
  }
  return (
    <>
      <section className="hero">
        <div className="hero-copy">
          <p className="eyebrow">
            <span />A NEW CHAPTER IN READING
          </p>
          <h1>
            Your books.
            <br />A voice.
            <br />
            <em>A conversation.</em>
          </h1>
          <p className="hero-description">
            Go beyond the last page. Turn the books you love into thoughtful
            conversations, grounded in their words.
          </p>
          <Button asChild>
            <Link href={owner ? "/books/new" : "/sign-in"}>
              {owner ? "Add your first chapter" : "Start your story"}
              <ArrowRight size={18} />
            </Link>
          </Button>
          <div className="hero-note">
            <Headphones size={16} aria-hidden />
            Upload a book. Choose a voice. Talk to its contents.
          </div>
        </div>
        <div className="hero-art" aria-hidden>
          <div className="art-orbit" />
          <div className="art-label">
            A whole new way
            <br />
            to get lost in a book.
          </div>
          <div className="art-book book-back">
            <span>
              THE ART OF
              <br />
              CURIOSITY
            </span>
          </div>
          <div className="art-book book-front">
            <div className="art-book-top">THE READER’S COMPANION</div>
            <BookOpen size={42} />
            <strong>
              Between
              <br />
              <em>the lines.</em>
            </strong>
            <div className="book-bottom">THERE’S MORE TO THE STORY</div>
          </div>
          <div className="voice-bubble">
            <span className="sound-bars">
              <i />
              <i />
              <i />
              <i />
              <i />
            </span>
            <span>Let’s talk about it.</span>
          </div>
          <span className="art-star">✧</span>
        </div>
      </section>
      <section className="library-section">
        <div className="section-heading">
          <div>
            <p className="eyebrow">YOUR PERSONAL BOOKSHELF</p>
            <h2>
              {owner ? "Recent books" : "Good stories deserve a conversation."}
            </h2>
          </div>
          {owner ? (
            <Button asChild variant="outline">
              <Link href="/books/new">
                <Plus size={16} />
                Add Book
              </Link>
            </Button>
          ) : null}
        </div>
        {owner ? (
          <>
            <LibrarySearch key={q} initial={q} />
            {unavailable ? (
              <div className="empty-state" role="status">
                <h3>Your library is temporarily unavailable</h3>
                <p>
                  We couldn’t reach your library. Refresh to try again; your
                  books are preserved.
                </p>
              </div>
            ) : result?.books.length ? (
              <>
                <div className="book-grid">
                  {result.books.map((book) => (
                    <article className="book-card" key={book.id}>
                      <Link
                        className="cover-link"
                        href={"/books/" + book.slug}
                        aria-label={"Open " + book.title}
                      >
                        <BookCover {...book} />
                      </Link>
                      <div className="book-info">
                        <span className={"status status-" + book.status}>
                          {book.status}
                        </span>
                        <h3>{book.title}</h3>
                        <p>{book.author}</p>
                        <Link
                          className="text-link"
                          href={"/books/" + book.slug}
                        >
                          Open book <ArrowRight size={15} />
                        </Link>
                      </div>
                    </article>
                  ))}
                </div>
                <nav className="pagination" aria-label="Library pages">
                  {page > 1 ? (
                    <Link
                      href={
                        "/?q=" + encodeURIComponent(q) + "&page=" + (page - 1)
                      }
                    >
                      Previous
                    </Link>
                  ) : null}
                  <span>Page {page}</span>
                  {page * 12 < result.total ? (
                    <Link
                      href={
                        "/?q=" + encodeURIComponent(q) + "&page=" + (page + 1)
                      }
                    >
                      Next
                    </Link>
                  ) : null}
                </nav>
              </>
            ) : (
              <div className="empty-state">
                <BookOpen size={34} aria-hidden />
                <h3>
                  {q
                    ? "No books match your search"
                    : "Your next great conversation starts here"}
                </h3>
                <p>
                  {q
                    ? "Try a different title or author, or clear your search."
                    : "Add a PDF to make this little corner of the world your own."}
                </p>
                <Button asChild variant="outline">
                  <Link href={q ? "/" : "/books/new"}>
                    {q ? "Clear search" : "Add your first book"}
                    <Plus size={16} />
                  </Link>
                </Button>
              </div>
            )}
          </>
        ) : (
          <div className="intro-grid">
            {[
              {
                icon: BookOpen,
                n: "01",
                title: "Bring your book",
                text: "Add a readable PDF to your private library.",
              },
              {
                icon: Headphones,
                n: "02",
                title: "Find your voice",
                text: "Choose a companion that feels right for you.",
              },
              {
                icon: Sparkles,
                n: "03",
                title: "Follow your curiosity",
                text: "Ask, explore, and return to the passages behind every answer.",
              },
            ].map((item) => (
              <article key={item.n}>
                <span className="step-number">{item.n}</span>
                <item.icon size={25} aria-hidden />
                <h3>{item.title}</h3>
                <p>{item.text}</p>
              </article>
            ))}
          </div>
        )}
      </section>
    </>
  );
}
