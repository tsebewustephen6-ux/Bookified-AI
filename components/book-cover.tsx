"use client";
import { useState } from "react";
import Image from "next/image";
import { BookOpen } from "lucide-react";
export function BookCover({
  id,
  title,
  author,
  hasCover = false,
}: {
  id: string;
  title: string;
  author: string;
  hasCover?: boolean;
}) {
  const [failed, setFailed] = useState(false);
  const color = [...id].reduce((a, c) => a + c.charCodeAt(0), 0) % 4;
  return (
    <div className={`book-cover cover-${color}`}>
      {hasCover && !failed ? (
        <Image
          unoptimized
          width={245}
          height={330}
          src={`/api/books/${id}/cover`}
          alt={`Cover of ${title}`}
          onError={() => setFailed(true)}
        />
      ) : (
        <>
          <span className="cover-edition">THE PERSONAL LIBRARY</span>
          <BookOpen aria-hidden size={28} />
          <strong>{title}</strong>
          <span>{author}</span>
          <div className="cover-rule" />
        </>
      )}
    </div>
  );
}
