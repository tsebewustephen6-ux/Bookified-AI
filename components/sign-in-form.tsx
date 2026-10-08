"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { signIn } from "@/lib/auth-client";
import { Button } from "./ui/button";

export function SignInForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectUrl = searchParams.get("redirect") || "/library";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleGoogleSignIn = async () => {
    setLoading(true);
    try {
      await signIn.social({
        provider: "google",
        callbackURL: redirectUrl,
      });
    } catch {
      setError("An unexpected error occurred with Google Sign-In.");
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const res = await signIn.email({
        email,
        password,
      });

      if (res.error) {
        setError(res.error.message || "Invalid email or password.");
        setLoading(false);
        return;
      }

      router.push(redirectUrl);
      router.refresh();
    } catch {
      setError("An unexpected error occurred. Please try again.");
      setLoading(false);
    }
  };

  return (
    <div
      className="panel"
      style={{ maxWidth: 440, width: "100%", margin: "0 auto" }}
    >
      <header style={{ marginBottom: 24, textAlign: "center" }}>
        <p className="eyebrow">YOUR PRIVATE LIBRARY</p>
        <h1 style={{ fontSize: 26, margin: "6px 0 8px" }}>Sign in to Bookified</h1>
        <p style={{ color: "var(--muted)", fontSize: 14 }}>
          Enter your email and password to open your personal library.
        </p>
      </header>

      {error && (
        <div className="error-message" role="alert">
          {error}
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 16, marginBottom: 16 }}>
        <Button
          type="button"
          onClick={handleGoogleSignIn}
          disabled={loading}
          style={{ width: "100%", background: "#fff", color: "#3c4043", border: "1px solid #dadce0", gap: 8 }}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
            <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
            <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
            <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
            <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
          </svg>
          Continue with Google
        </Button>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 16 }}>
        <div style={{ flex: 1, height: 1, backgroundColor: "var(--border)" }} />
        <span style={{ fontSize: 13, color: "var(--muted)" }}>OR</span>
        <div style={{ flex: 1, height: 1, backgroundColor: "var(--border)" }} />
      </div>

      <form
        onSubmit={handleSubmit}
        style={{ display: "flex", flexDirection: "column", gap: 16 }}
      >
        <div className="field">
          <label htmlFor="email">Email address</label>
          <input
            id="email"
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
          />
        </div>

        <div className="field">
          <label htmlFor="password">Password</label>
          <input
            id="password"
            type="password"
            required
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
          />
        </div>

        <Button
          type="submit"
          disabled={loading}
          style={{ width: "100%", marginTop: 8 }}
        >
          {loading ? "Signing in…" : "Sign in"}
        </Button>
      </form>

      <footer
        style={{
          marginTop: 24,
          textAlign: "center",
          fontSize: 13,
          color: "var(--muted)",
        }}
      >
        Don&apos;t have an account yet?{" "}
        <Link href="/sign-up" className="text-link" style={{ fontWeight: 600 }}>
          Create an account
        </Link>
      </footer>
    </div>
  );
}
