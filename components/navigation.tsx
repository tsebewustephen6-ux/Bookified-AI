"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { UserButton } from "@clerk/nextjs";
import { Plus, ArrowUpRight } from "lucide-react";
import { Brand } from "./brand";
export function Navigation({
  signedIn,
  configured,
}: {
  signedIn: boolean;
  configured: boolean;
}) {
  const path = usePathname();
  return (
    <header className="site-header">
      <div className="nav-wrap">
        <Link className="brand" href="/" aria-label="Bookified home">
          <Brand />
        </Link>
        <nav aria-label="Main navigation">
          {[
            { href: "/", label: "Library" },
            { href: "/books/new", label: "Add New" },
            { href: "/subscriptions", label: "Plans" },
          ].map((item) => (
            <Link
              key={item.href}
              href={item.href}
              aria-current={
                (
                  item.href === "/"
                    ? path === "/" ||
                      (path.startsWith("/books/") && path !== "/books/new")
                    : path.startsWith(item.href)
                )
                  ? "page"
                  : undefined
              }
            >
              {item.label === "Add New" ? <Plus size={15} aria-hidden /> : null}
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="nav-auth">
          {signedIn && configured ? (
            <UserButton />
          ) : (
            <Link href="/sign-in" className="sign-in">
              Sign in <ArrowUpRight size={14} aria-hidden />
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}
