import Link from "next/link";
import { ArrowRight, BookOpen, Plus } from "lucide-react";
import { redirect } from "next/navigation";
import { currentOwner } from "@/lib/auth";
import { library } from "@/lib/books";
import { Button } from "@/components/ui/button";
import { LibrarySearch } from "@/components/search";
import { BookCover } from "@/components/book-cover";

export default async function LibraryPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; page?: string }>;
}) {
  const [owner, params] = await Promise.all([currentOwner(), searchParams]);
  if (!owner) {
    redirect("/sign-in");
  }

  const q = (params.q || "").slice(0, 200);
  const page = Math.max(
    1,
    Math.min(10000, Math.floor(Number(params.page) || 1)),
  );
  let result: Awaited<ReturnType<typeof library>> | undefined;
  let unavailable = false;
  
  try {
    result = await library(owner, q, page);
  } catch {
    unavailable = true;
  }

  return (
    <section className="library-section" style={{ paddingTop: "60px", paddingBottom: "100px" }}>
      <div className="section-heading">
        <div>
          <p className="eyebrow">YOUR PERSONAL BOOKSHELF</p>
          <h2>Recent books</h2>
        </div>
        <Button asChild variant="outline">
          <Link href="/books/new">
            <Plus size={16} />
            Add Book
          </Link>
        </Button>
      </div>

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
                  "/library?q=" + encodeURIComponent(q) + "&page=" + (page - 1)
                }
              >
                Previous
              </Link>
            ) : null}
            <span>Page {page}</span>
            {page * 12 < result.total ? (
              <Link
                href={
                  "/library?q=" + encodeURIComponent(q) + "&page=" + (page + 1)
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
            <Link href={q ? "/library" : "/books/new"}>
              {q ? "Clear search" : "Add your first book"}
              <Plus size={16} />
            </Link>
          </Button>
        </div>
      )}
    </section>
  );
}
