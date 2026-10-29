import type { Metadata } from "next";
import { Suspense } from "react";
import { SiteShell } from "@/components/site-shell";
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
    <SiteShell user={user} configured={authConfigured()}>
      {children}
    </SiteShell>
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
