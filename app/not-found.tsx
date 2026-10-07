import Link from "next/link";
export default function NotFound() {
  return (
    <section className="page-header">
      <h1>This chapter isn’t here.</h1>
      <p>The page may be unavailable or belong to another library.</p>
      <Link className="text-link" href="/">
        Return to Library
      </Link>
    </section>
  );
}
