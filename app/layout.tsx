import type { Metadata } from "next";
import { Suspense } from "react";
import { Navigation } from "@/components/navigation";
import { Brand } from "@/components/brand";
import { authConfigured } from "@/lib/env";
import { currentUser } from "@/lib/auth";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "Bookified — A new chapter in reading",
    template: "%s · Bookified",
  },
  description: "Upload a book. Choose a voice. Talk to its contents.",
};

async function Shell({ children }: { children: React.ReactNode }) {
  const user = await currentUser();
  return (
    <>
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <Navigation user={user} configured={authConfigured()} />
      <main id="main" className="main-wrap">
        {children}
      </main>
      <footer className="site-footer">
        <Brand compact />
        <p>A little more conversation. A lot more understanding.</p>
        <span>YOUR BOOKS, YOUR SPACE</span>
      </footer>
    </>
  );
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <Suspense fallback={<p className="main-wrap">Opening Bookified…</p>}>
          <Shell>{children}</Shell>
        </Suspense>
      </body>
    </html>
  );
}
