"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Plus, ArrowUpRight, LogOut, User as UserIcon } from "lucide-react";
import { Brand } from "./brand";
import { signOut } from "@/lib/auth-client";
import { useState, useRef, useEffect } from "react";

export function Navigation({
  user,
  configured,
}: {
  user: { id: string; name?: string | null; email?: string | null } | null;
  configured: boolean;
}) {
  const path = usePathname();
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleSignOut = async () => {
    try {
      await signOut();
      setMenuOpen(false);
      router.push("/");
      router.refresh();
    } catch {
      router.push("/");
      router.refresh();
    }
  };

  const displayName = user?.name || user?.email?.split("@")[0] || "Reader";
  const initial = displayName[0]?.toUpperCase() || "R";

  return (
    <header className="site-header">
      <div className="nav-wrap">
        <Link className="brand" href="/" aria-label="Bookified home">
          <Brand />
        </Link>
        <nav aria-label="Main navigation">
          {[
            ...(user
              ? [
                  { href: "/library", label: "Library" },
                ]
              : [{ href: "/subscriptions", label: "Plans" }]),
          ].map((item) => (
            <Link
              key={item.href}
              href={item.href}
              aria-current={
                (
                  item.label === "Library"
                    ? path === "/library" ||
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
          {user && configured ? (
            <div
              className="user-menu-wrap"
              ref={menuRef}
              style={{ position: "relative" }}
            >
              <button
                type="button"
                className="user-badge-btn"
                onClick={() => setMenuOpen(!menuOpen)}
                aria-expanded={menuOpen}
                aria-label="User account menu"
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  background: "#fdfbf7",
                  border: "1px solid var(--border)",
                  borderRadius: 9999,
                  padding: "4px 12px 4px 5px",
                  cursor: "pointer",
                  color: "var(--foreground)",
                  fontSize: 13,
                  fontWeight: 500,
                  transition: "background 0.15s ease",
                }}
              >
                <span
                  style={{
                    width: 26,
                    height: 26,
                    borderRadius: "50%",
                    background: "var(--primary, #745444)",
                    color: "#fff",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 12,
                    fontWeight: 600,
                  }}
                >
                  {initial}
                </span>
                <span
                  style={{
                    maxWidth: 110,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {displayName}
                </span>
              </button>
              {menuOpen && (
                <div
                  className="user-dropdown-menu"
                  style={{
                    position: "absolute",
                    right: 0,
                    top: "calc(100% + 8px)",
                    background: "#fffdfa",
                    border: "1px solid var(--border)",
                    borderRadius: 10,
                    boxShadow: "0 10px 28px rgba(90, 70, 50, 0.15)",
                    padding: "6px",
                    minWidth: 200,
                    zIndex: 100,
                  }}
                >
                  <div
                    style={{
                      padding: "8px 10px",
                      borderBottom: "1px solid var(--border)",
                      marginBottom: 4,
                    }}
                  >
                    <div style={{ fontWeight: 600, fontSize: 13 }}>
                      {user.name || "Reader"}
                    </div>
                    {user.email && (
                      <div
                        style={{
                          fontSize: 11,
                          color: "var(--muted)",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                        }}
                      >
                        {user.email}
                      </div>
                    )}
                  </div>
                  <Link
                    href="/subscriptions"
                    onClick={() => setMenuOpen(false)}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      padding: "8px 10px",
                      borderRadius: 6,
                      fontSize: 12,
                      color: "var(--foreground)",
                      textDecoration: "none",
                    }}
                  >
                    <UserIcon size={14} /> My Plan & Usage
                  </Link>
                  <button
                    type="button"
                    onClick={handleSignOut}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      width: "100%",
                      padding: "8px 10px",
                      borderRadius: 6,
                      border: "none",
                      background: "none",
                      color: "#993822",
                      fontSize: 12,
                      cursor: "pointer",
                      textAlign: "left",
                    }}
                  >
                    <LogOut size={14} /> Sign out
                  </button>
                </div>
              )}
            </div>
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
