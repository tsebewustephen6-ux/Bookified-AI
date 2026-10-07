"use client";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { Search, X } from "lucide-react";
export function LibrarySearch({ initial }: { initial: string }) {
  const [value, setValue] = useState(initial);
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );
  function change(next: string) {
    setValue(next);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      const search = new URLSearchParams();
      if (next.trim()) search.set("q", next.trim().slice(0, 200));
      startTransition(() =>
        router.replace(search.size ? `/?${search}` : "/", { scroll: false }),
      );
    }, 250);
  }
  return (
    <div className="search-box" aria-busy={pending}>
      <Search size={18} aria-hidden />
      <label className="sr-only" htmlFor="library-search">
        Search title or author
      </label>
      <input
        id="library-search"
        value={value}
        maxLength={200}
        onChange={(e) => change(e.target.value)}
        placeholder="Search your library…"
      />
      {value ? (
        <button
          type="button"
          onClick={() => change("")}
          aria-label="Clear search"
        >
          <X size={18} />
        </button>
      ) : null}
    </div>
  );
}
