import Image from "next/image";

export function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <span className={`brand-lockup${compact ? " brand-lockup-compact" : ""}`}>
      <Image
        className="brand-symbol"
        src="/brand/bookified-mark.png"
        width={48}
        height={48}
        alt=""
        unoptimized
      />
      <span className="brand-wordmark">
        bookified<span className="brand-dot">.</span>
      </span>
    </span>
  );
}
