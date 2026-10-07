"use client";
import { Button } from "@/components/ui/button";
export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <section className="page-header">
      <h1>Let’s try that again.</h1>
      <p>Something interrupted this page. Your library is preserved.</p>
      <Button onClick={reset}>Try again</Button>
    </section>
  );
}
