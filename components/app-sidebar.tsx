"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  MessageSquare,
  BookOpen,
  Plus,
  Search,
  Trash2,
  Check,
  X,
  RotateCw,
  Library as LibraryIcon,
  CreditCard,
  ArrowLeft,
  Sparkles,
  Clock,
} from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuAction,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSkeleton,
  SidebarSeparator,
  useSidebar,
} from "@/components/ui/sidebar";
import { Brand } from "@/components/brand";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type SidebarConversationItem = {
  id: string;
  name: string;
  date: string;
  status: string;
  durationSeconds: number;
  preview: string;
  hasTranscript: boolean;
  book?: {
    id: string;
    title: string;
    author: string;
    slug: string;
    coverKey?: string | null;
    status?: string;
  } | null;
};

export type CurrentBookMeta = {
  id: string;
  title: string;
  author: string;
  slug: string;
  coverKey?: string | null;
  status?: string;
};

function formatRelativeTime(dateString: string): string {
  try {
    const date = new Date(dateString);
    const now = Date.now();
    const diffMs = now - date.getTime();
    const diffSecs = Math.floor(diffMs / 1000);

    if (diffSecs < 60) return "Just now";
    if (diffSecs < 3600) return `${Math.floor(diffSecs / 60)}m ago`;
    if (diffSecs < 86400) return `${Math.floor(diffSecs / 3600)}h ago`;
    if (diffSecs < 172800) return "Yesterday";
    return date.toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
    });
  } catch {
    return "";
  }
}

function groupConversations(items: SidebarConversationItem[]) {
  const now = new Date();
  const startOfToday = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate()
  ).getTime();
  const startOfYesterday = startOfToday - 86400000;
  const startOf7Days = startOfToday - 6 * 86400000;
  const startOf30Days = startOfToday - 29 * 86400000;

  const groups: { label: string; items: SidebarConversationItem[] }[] = [
    { label: "Today", items: [] },
    { label: "Yesterday", items: [] },
    { label: "Previous 7 Days", items: [] },
    { label: "Previous 30 Days", items: [] },
    { label: "Older", items: [] },
  ];

  for (const item of items) {
    const time = new Date(item.date).getTime();
    if (time >= startOfToday) {
      groups[0].items.push(item);
    } else if (time >= startOfYesterday) {
      groups[1].items.push(item);
    } else if (time >= startOf7Days) {
      groups[2].items.push(item);
    } else if (time >= startOf30Days) {
      groups[3].items.push(item);
    } else {
      groups[4].items.push(item);
    }
  }

  return groups.filter((g) => g.items.length > 0);
}

export function AppSidebar({
  user,
}: {
  user: { id: string; name?: string | null; email?: string | null } | null;
}) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const router = useRouter();
  const { setOpenMobile } = useSidebar();

  const isBookPage =
    Boolean(pathname?.startsWith("/books/")) && pathname !== "/books/new";
  const currentSlug = isBookPage ? pathname?.split("/")[2] : null;
  const activeSessionId = searchParams?.get("session") || null;

  const [items, setItems] = React.useState<SidebarConversationItem[]>([]);
  const [currentBook, setCurrentBook] = React.useState<CurrentBookMeta | null>(
    null
  );
  const [loading, setLoading] = React.useState<boolean>(true);
  const [loadingMore, setLoadingMore] = React.useState<boolean>(false);
  const [nextCursor, setNextCursor] = React.useState<string | null>(null);
  const [searchQuery, setSearchQuery] = React.useState<string>("");
  const [confirmDeleteId, setConfirmDeleteId] = React.useState<string | null>(
    null
  );
  const [deletingId, setDeletingId] = React.useState<string | null>(null);
  const [deleteError, setDeleteError] = React.useState<string | null>(null);

  // Load conversations based on route:
  // If inside a book (/books/[slug]): fetch only that book's conversations
  // If anywhere else: fetch all conversations across all books
  const loadConversations = React.useCallback(
    async (cursor?: string) => {
      if (!user) {
        setItems([]);
        setLoading(false);
        return;
      }

      if (cursor) {
        setLoadingMore(true);
      } else {
        setLoading(true);
      }
      setDeleteError(null);

      try {
        let endpoint = "";
        if (currentSlug) {
          endpoint = `/api/books/${encodeURIComponent(currentSlug)}/sessions`;
          if (cursor) endpoint += `?cursor=${encodeURIComponent(cursor)}`;
        } else {
          endpoint = `/api/sessions?limit=25`;
          if (cursor) endpoint += `&cursor=${encodeURIComponent(cursor)}`;
        }

        const res = await fetch(endpoint, { cache: "no-store" });
        if (!res.ok) {
          throw new Error("Failed to load conversations");
        }
        const data = await res.json();

        if (currentSlug && data.book) {
          setCurrentBook(data.book);
        } else if (!currentSlug) {
          setCurrentBook(null);
        }

        const fetchedItems: SidebarConversationItem[] = data.items || [];
        setItems((prev) => {
          if (cursor) {
            const existingIds = new Set(prev.map((i) => i.id));
            const newRows = fetchedItems.filter((i) => !existingIds.has(i.id));
            return [...prev, ...newRows];
          }
          return fetchedItems;
        });
        setNextCursor(data.nextCursor || null);
      } catch (err) {
        console.error("Sidebar conversation fetch error:", err);
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [user, currentSlug]
  );

  // Trigger re-fetch when book route or user changes
  React.useEffect(() => {
    void loadConversations();
  }, [loadConversations]);

  // Listen for custom app events (call completed, conversation updated/deleted)
  React.useEffect(() => {
    function handleUpdate() {
      void loadConversations();
    }
    function handleDelete(event: Event) {
      const customEvent = event as CustomEvent<{ id: string }>;
      if (customEvent.detail?.id) {
        setItems((prev) => prev.filter((i) => i.id !== customEvent.detail.id));
      }
    }

    window.addEventListener("bookified:conversation-updated", handleUpdate);
    window.addEventListener("bookified:conversation-deleted", handleDelete);
    return () => {
      window.removeEventListener("bookified:conversation-updated", handleUpdate);
      window.removeEventListener("bookified:conversation-deleted", handleDelete);
    };
  }, [loadConversations]);

  // Handle conversation deletion
  async function handleDeleteConversation(
    e: React.MouseEvent,
    item: SidebarConversationItem
  ) {
    e.stopPropagation();
    e.preventDefault();

    setDeletingId(item.id);
    setDeleteError(null);

    // Optimistic removal
    const previousItems = items;
    setItems((prev) => prev.filter((row) => row.id !== item.id));

    try {
      const res = await fetch(`/api/sessions/${encodeURIComponent(item.id)}`, {
        method: "DELETE",
        cache: "no-store",
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(
          body?.error?.message || "Could not delete this conversation."
        );
      }

      // Notify other parts of the app
      window.dispatchEvent(
        new CustomEvent("bookified:conversation-deleted", {
          detail: { id: item.id },
        })
      );

      // If the deleted conversation is currently open, reset to fresh book view
      if (activeSessionId === item.id) {
        if (currentSlug) {
          router.push(`/books/${currentSlug}`);
        } else if (item.book?.slug) {
          router.push(`/books/${item.book.slug}`);
        }
      }
    } catch (err) {
      // Revert optimistic removal on error
      setItems(previousItems);
      setDeleteError(
        err instanceof Error ? err.message : "Failed to delete conversation."
      );
    } finally {
      setDeletingId(null);
      setConfirmDeleteId(null);
    }
  }

  // Handle "New conversation" / "New chat" click
  function handleNewChat() {
    setOpenMobile(false);
    if (currentSlug) {
      router.push(`/books/${currentSlug}`);
    } else {
      router.push("/library");
    }
  }

  // Filter conversations by search term
  const filteredItems = React.useMemo(() => {
    if (!searchQuery.trim()) return items;
    const q = searchQuery.toLowerCase().trim();
    return items.filter((item) => {
      const name = item.name?.toLowerCase() || "";
      const preview = item.preview?.toLowerCase() || "";
      const bookTitle = item.book?.title?.toLowerCase() || "";
      return (
        name.includes(q) || preview.includes(q) || bookTitle.includes(q)
      );
    });
  }, [items, searchQuery]);

  const grouped = React.useMemo(
    () => groupConversations(filteredItems),
    [filteredItems]
  );

  const displayName = user?.name || user?.email?.split("@")[0] || "Reader";
  const initial = displayName[0]?.toUpperCase() || "R";

  return (
    <Sidebar
      collapsible="offcanvas"
      className="bookified-app-sidebar border-r border-[var(--sidebar-border,#e2dcd1)] bg-[var(--sidebar-background,#faf8f4)]"
      data-testid="app-sidebar"
    >
      {/* 1. Header with Brand, Collapse Trigger, and "+ New chat" Button */}
      <SidebarHeader className="p-3 pb-2 space-y-2 border-b border-[var(--sidebar-border,#e2dcd1)]">
        <div className="flex items-center px-1">
          <Link
            href="/"
            onClick={() => setOpenMobile(false)}
            className="flex items-center gap-2 group transition-opacity hover:opacity-85"
            aria-label="Bookified Home"
          >
            <Brand compact />
          </Link>
        </div>

        {/* ChatGPT / Claude style prominent "New chat" button */}
        <Button
          type="button"
          variant="outline"
          onClick={handleNewChat}
          className="w-full justify-between items-center bg-[#fffdfa] hover:bg-[var(--sidebar-accent,#ede7dc)] border-[var(--sidebar-border,#e2dcd1)] text-[var(--sidebar-foreground,#302b26)] text-xs font-medium h-9 shadow-2xs rounded-lg transition-all"
        >
          <span className="flex items-center gap-2">
            <Plus className="w-4 h-4 text-[var(--accent,#765747)]" />
            {currentSlug ? "New conversation" : "Start discussion"}
          </span>
          <span className="text-[10px] text-[var(--muted,#777064)] tracking-wide bg-[var(--sidebar-accent,#ede7dc)]/60 px-1.5 py-0.5 rounded">
            {currentSlug ? "This book" : "Library"}
          </span>
        </Button>

        {/* Search filter input */}
        <div className="relative flex items-center">
          <Search className="w-3.5 h-3.5 absolute left-2.5 text-[var(--muted,#777064)] pointer-events-none" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={
              currentSlug ? "Search in this book…" : "Search discussions…"
            }
            className="w-full pl-8 pr-7 py-1.5 text-xs rounded-md bg-[var(--background,#f8f5ee)]/80 border border-[var(--sidebar-border,#e2dcd1)] placeholder:text-[var(--muted,#777064)] focus:outline-none focus:ring-1 focus:ring-[var(--accent,#765747)] focus:bg-[#fffdfa] transition-all"
          />
          {searchQuery ? (
            <button
              type="button"
              onClick={() => setSearchQuery("")}
              className="absolute right-2 text-[var(--muted,#777064)] hover:text-[var(--foreground,#302b26)]"
              aria-label="Clear search"
            >
              <X className="w-3 h-3" />
            </button>
          ) : null}
        </div>
      </SidebarHeader>

      {/* 2. Content: Context Banner & Grouped Conversations */}
      <SidebarContent className="px-2 py-2 overflow-y-auto space-y-3">
        {/* If inside a book: Display "Current Book" context banner with quick return link */}
        {currentSlug ? (
          <div className="mx-1 p-2.5 rounded-lg bg-[var(--sidebar-accent,#ede7dc)]/60 border border-[var(--sidebar-border,#e2dcd1)]/80 text-xs space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-1.5 font-semibold text-[var(--accent,#765747)] uppercase tracking-wider text-[10px]">
                <BookOpen className="w-3.5 h-3.5" />
                Current Book
              </span>
              <Link
                href="/library"
                onClick={() => setOpenMobile(false)}
                className="text-[10px] text-[var(--muted,#777064)] hover:text-[var(--accent,#765747)] flex items-center gap-1 hover:underline font-medium"
                title="View all books and global conversation history"
              >
                <ArrowLeft className="w-3 h-3" />
                All books
              </Link>
            </div>
            <h3 className="font-serif font-medium text-[13px] text-[var(--foreground,#302b26)] truncate">
              {currentBook?.title || "Book Discussion"}
            </h3>
            {currentBook?.author ? (
              <p className="text-[11px] text-[var(--muted,#777064)] truncate">
                by {currentBook.author}
              </p>
            ) : null}
          </div>
        ) : null}

        {/* Delete error feedback banner if any */}
        {deleteError ? (
          <div
            role="alert"
            className="mx-1 p-2 text-xs text-red-800 bg-red-50 border border-red-200 rounded-md"
          >
            {deleteError}
          </div>
        ) : null}

        {/* Loading state skeleton */}
        {loading ? (
          <div className="space-y-2 p-1">
            <SidebarMenuSkeleton showIcon />
            <SidebarMenuSkeleton showIcon />
            <SidebarMenuSkeleton showIcon />
            <SidebarMenuSkeleton showIcon />
          </div>
        ) : filteredItems.length === 0 ? (
          /* Empty state */
          <div className="p-6 text-center text-xs text-[var(--muted,#777064)] space-y-2">
            <MessageSquare className="w-6 h-6 mx-auto text-[var(--muted,#777064)]/50" />
            <p className="font-medium">
              {searchQuery
                ? "No matching conversations"
                : currentSlug
                ? "No saved conversations for this book"
                : "No conversations recorded yet"}
            </p>
            <p className="text-[11px] leading-relaxed">
              {searchQuery
                ? "Try a different search query."
                : currentSlug
                ? "Press the microphone on this page to begin your first grounded voice discussion."
                : "Pick any book from your library and start a voice conversation."}
            </p>
          </div>
        ) : (
          /* Grouped list of conversations */
          grouped.map((group) => (
            <SidebarGroup key={group.label} className="p-0">
              <SidebarGroupLabel className="text-[10px] uppercase tracking-wider font-semibold text-[var(--muted,#777064)] px-2 py-1">
                {group.label}
              </SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu className="gap-1">
                  {group.items.map((item) => {
                    const isSelected = activeSessionId === item.id;
                    const bookSlug = item.book?.slug || currentSlug || "";
                    const targetHref = bookSlug
                      ? `/books/${bookSlug}?session=${item.id}`
                      : `/library`;
                    const isConfirming = confirmDeleteId === item.id;
                    const isDeleting = deletingId === item.id;

                    return (
                      <SidebarMenuItem
                        key={item.id}
                        className="group/menu-item relative"
                      >
                        <SidebarMenuButton
                          asChild
                          isActive={isSelected}
                          className={cn(
                            "w-full h-auto py-2 px-2.5 rounded-lg flex flex-col items-start gap-0.5 text-left transition-colors",
                            isSelected
                              ? "bg-[var(--sidebar-accent,#ede7dc)] text-[var(--sidebar-foreground,#302b26)] font-medium shadow-2xs"
                              : "hover:bg-[var(--sidebar-accent,#ede7dc)]/60 text-[var(--sidebar-foreground,#302b26)]"
                          )}
                        >
                          <Link
                            href={targetHref}
                            onClick={() => setOpenMobile(false)}
                            className="w-full pr-7"
                          >
                            {/* In All-books mode: Show book title tag above discussion topic */}
                            {!currentSlug && item.book ? (
                              <span className="flex items-center gap-1 text-[10px] text-[var(--accent,#765747)] font-semibold truncate max-w-[90%]">
                                <BookOpen className="w-2.5 h-2.5 shrink-0" />
                                {item.book.title}
                              </span>
                            ) : null}

                            {/* Discussion title / topic */}
                            <span className="text-xs font-medium text-[var(--foreground,#302b26)] truncate w-full block">
                              {item.name ||
                                item.preview ||
                                "Book conversation"}
                            </span>

                            {/* Meta: relative time and duration */}
                            <span className="flex items-center gap-1.5 text-[10px] text-[var(--muted,#777064)]">
                              <Clock className="w-2.5 h-2.5" />
                              <span>{formatRelativeTime(item.date)}</span>
                              {item.durationSeconds > 0 ? (
                                <>
                                  <span>·</span>
                                  <span>
                                    {Math.ceil(item.durationSeconds / 60)}m
                                  </span>
                                </>
                              ) : null}
                            </span>
                          </Link>
                        </SidebarMenuButton>

                        {/* Delete action (ChatGPT/Claude style hover trash icon or inline confirmation) */}
                        {isConfirming ? (
                          <div
                            className="absolute right-1 top-2 z-20 flex items-center gap-1 bg-[#fffdfa] border border-red-200 shadow-xs rounded-md px-1.5 py-0.5 animate-in fade-in zoom-in-95 duration-100"
                            onClick={(e) => {
                              e.stopPropagation();
                              e.preventDefault();
                            }}
                          >
                            <span className="text-[10px] font-medium text-red-800">
                              Delete?
                            </span>
                            <button
                              type="button"
                              disabled={isDeleting}
                              onClick={(e) =>
                                void handleDeleteConversation(e, item)
                              }
                              className="p-1 rounded text-red-700 hover:bg-red-100 transition-colors"
                              title="Confirm delete"
                              aria-label="Confirm delete conversation"
                            >
                              {isDeleting ? (
                                <RotateCw className="w-3 h-3 animate-spin" />
                              ) : (
                                <Check className="w-3 h-3 stroke-[2.5]" />
                              )}
                            </button>
                            <button
                              type="button"
                              disabled={isDeleting}
                              onClick={(e) => {
                                e.stopPropagation();
                                setConfirmDeleteId(null);
                              }}
                              className="p-1 rounded text-[var(--muted,#777064)] hover:bg-[var(--sidebar-accent,#ede7dc)] transition-colors"
                              title="Cancel"
                              aria-label="Cancel delete"
                            >
                              <X className="w-3 h-3" />
                            </button>
                          </div>
                        ) : (
                          <SidebarMenuAction
                            showOnHover
                            onClick={(e) => {
                              e.stopPropagation();
                              e.preventDefault();
                              setConfirmDeleteId(item.id);
                            }}
                            className="text-[var(--muted,#777064)] hover:text-red-700 hover:bg-red-50/80 rounded"
                            title="Delete conversation"
                            aria-label={`Delete conversation ${item.name || ""}`}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </SidebarMenuAction>
                        )}
                      </SidebarMenuItem>
                    );
                  })}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          ))
        )}

        {/* Load more button if pagination cursor exists */}
        {nextCursor ? (
          <div className="p-2 pt-1">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={loadingMore}
              onClick={() => void loadConversations(nextCursor)}
              className="w-full text-xs text-[var(--muted,#777064)] hover:text-[var(--foreground,#302b26)] gap-1.5 h-8"
            >
              <RotateCw
                className={cn("w-3 h-3", loadingMore && "animate-spin")}
              />
              {loadingMore ? "Loading older…" : "Load older discussions"}
            </Button>
          </div>
        ) : null}
      </SidebarContent>

      {/* 3. Footer: Navigation Links & User Profile */}
      <SidebarFooter className="p-2 border-t border-[var(--sidebar-border,#e2dcd1)] space-y-1.5 bg-[var(--sidebar-background,#faf8f4)]">
        <SidebarMenu className="gap-0.5">
          <SidebarMenuItem>
            <SidebarMenuButton asChild size="sm">
              <Link
                href="/library"
                onClick={() => setOpenMobile(false)}
                className="text-xs flex items-center gap-2 text-[var(--sidebar-foreground,#302b26)]"
              >
                <LibraryIcon className="w-3.5 h-3.5 text-[var(--accent,#765747)]" />
                <span>My Library</span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>

          <SidebarMenuItem>
            <SidebarMenuButton asChild size="sm">
              <Link
                href="/books/new"
                onClick={() => setOpenMobile(false)}
                className="text-xs flex items-center gap-2 text-[var(--sidebar-foreground,#302b26)]"
              >
                <Plus className="w-3.5 h-3.5 text-[var(--accent,#765747)]" />
                <span>Add new book</span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>

          <SidebarMenuItem>
            <SidebarMenuButton asChild size="sm">
              <Link
                href="/subscriptions"
                onClick={() => setOpenMobile(false)}
                className="text-xs flex items-center gap-2 text-[var(--sidebar-foreground,#302b26)]"
              >
                <CreditCard className="w-3.5 h-3.5 text-[var(--accent,#765747)]" />
                <span>Plans & Usage</span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>

        <SidebarSeparator className="my-1" />

        {/* User Profile snippet */}
        {user ? (
          <div className="flex items-center justify-between px-2 py-1 text-xs">
            <div className="flex items-center gap-2 min-w-0">
              <span className="w-6 h-6 rounded-full bg-[var(--accent,#765747)] text-[#fff9ef] flex items-center justify-center font-bold text-[11px] shrink-0">
                {initial}
              </span>
              <div className="min-w-0">
                <p className="font-medium text-[var(--foreground,#302b26)] truncate text-xs leading-none">
                  {displayName}
                </p>
                {user.email ? (
                  <p className="text-[10px] text-[var(--muted,#777064)] truncate leading-tight mt-0.5">
                    {user.email}
                  </p>
                ) : null}
              </div>
            </div>
            <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-[var(--accent,#765747)] bg-[var(--accent,#765747)]/10 px-1.5 py-0.5 rounded">
              <Sparkles className="w-2.5 h-2.5" />
              Pro
            </span>
          </div>
        ) : (
          <div className="p-1">
            <Button asChild size="sm" variant="outline" className="w-full text-xs">
              <Link href="/sign-in" onClick={() => setOpenMobile(false)}>
                Sign in to save history
              </Link>
            </Button>
          </div>
        )}
      </SidebarFooter>
    </Sidebar>
  );
}
