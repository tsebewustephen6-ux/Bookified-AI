"use client";

import { usePathname } from "next/navigation";
import { Navigation } from "@/components/navigation";
import { Brand } from "@/components/brand";
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/app-sidebar";

export function SiteShell({
  children,
  user,
  configured,
}: {
  children: React.ReactNode;
  user: { id: string; name?: string | null; email?: string | null } | null;
  configured: boolean;
}) {
  const path = usePathname();
  const isAuthPage = path?.startsWith("/sign-in") || path?.startsWith("/sign-up");
  const isHomePage = path === "/";

  if (isAuthPage) {
    return (
      <main id="main" className="auth-main-wrap">
        {children}
      </main>
    );
  }

  if (isHomePage) {
    return (
      <>
        <a className="skip-link" href="#main">
          Skip to content
        </a>
        <Navigation user={user} configured={configured} />
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

  return (
    <SidebarProvider defaultOpen={true}>
      <AppSidebar user={user} />
      <SidebarInset className="min-h-svh flex flex-col bg-[var(--background,#f8f5ee)] overflow-x-hidden">
        <a className="skip-link" href="#main">
          Skip to content
        </a>
        <Navigation user={user} configured={configured} />
        <main id="main" className="main-wrap flex-1">
          {children}
        </main>
        <footer className="site-footer">
          <Brand compact />
          <p>A little more conversation. A lot more understanding.</p>
          <span>YOUR BOOKS, YOUR SPACE</span>
        </footer>
      </SidebarInset>
    </SidebarProvider>
  );
}
