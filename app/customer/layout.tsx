"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Gift, Globe, Inbox, Map, MessageCircle, Search, ShoppingCart, ReceiptText } from "lucide-react";
import { useRequireRole } from "@/components/providers/auth";
import { useCart } from "@/components/providers/cart";
import { ChatbotWidget } from "@/components/shared/chatbot-widget";

const UNREAD_POLL_MS = 30_000;

const NAV = [
  { href: "/customer/explore", label: "Explore", icon: Search },
  { href: "/customer/map", label: "Map", icon: Map },
  { href: "/customer/chat", label: "Chat", icon: MessageCircle },
  { href: "/customer/cart", label: "Cart", icon: ShoppingCart },
  { href: "/customer/activity?tab=itinerary", label: "My Activity", icon: ReceiptText },
  { href: "/customer/affiliate", label: "Earn & Share", icon: Gift },
  { href: "/customer/support", label: "Support", icon: Inbox },
];

export default function CustomerLayout({ children }: { children: React.ReactNode }) {
  const { currentUser, loading } = useRequireRole(["customer"]);
  const { count } = useCart();
  const pathname = usePathname();
  // CLAUDE-FIXES-2.md item 1: a dot on the Support nav item when there's an
  // unread admin reply anywhere in my tickets. Polled — no realtime chat
  // infra exists elsewhere in this repo to piggyback on.
  const [unreadTickets, setUnreadTickets] = useState(0);

  useEffect(() => {
    if (!currentUser) return;
    let cancelled = false;
    async function poll() {
      try {
        const res = await fetch("/api/support/unread-count");
        const body = (await res.json()) as { data: { count: number } | null };
        if (!cancelled && res.ok && body.data) setUnreadTickets(body.data.count);
      } catch {
        // best-effort — a failed poll just leaves the last-known count showing
      }
    }
    (async () => {
      await poll();
    })();
    const interval = setInterval(() => {
      (async () => {
        await poll();
      })();
    }, UNREAD_POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [currentUser]);

  if (loading || !currentUser) {
    return <div className="min-h-screen flex items-center justify-center text-muted-foreground text-sm">Loading…</div>;
  }

  return (
    <div className="min-h-screen flex flex-col" style={{ backgroundColor: "var(--background)" }}>
      <nav className="sticky top-0 z-40 border-b border-border bg-background/95 backdrop-blur-md print:hidden">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 flex items-center gap-4 sm:gap-8 h-16">
          <Link href="/customer/explore" className="flex items-center gap-2 shrink-0">
            <div className="w-8 h-8 rounded-xl flex items-center justify-center bg-primary">
              <Globe size={16} className="text-white" />
            </div>
            <span className="font-bold text-base text-foreground font-[family-name:var(--font-display)]">MyWisata</span>
          </Link>

          <div className="hidden md:flex items-center gap-6 flex-1">
            {NAV.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="relative text-sm font-medium transition-colors hover:opacity-70"
                style={{ color: pathname.startsWith(item.href) ? "var(--primary)" : "var(--muted-foreground)" }}
              >
                {item.label}
                {item.href === "/customer/support" && unreadTickets > 0 && (
                  <span className="absolute -top-1 -right-2 w-2 h-2 rounded-full bg-destructive" />
                )}
              </Link>
            ))}
          </div>

          <Link href="/customer/cart" className="relative md:hidden ml-auto">
            <ShoppingCart size={20} className="text-foreground" />
            {count > 0 && (
              <span className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full text-[9px] font-bold text-white flex items-center justify-center bg-destructive">
                {count}
              </span>
            )}
          </Link>

          <div className="hidden md:flex items-center gap-3 ml-auto shrink-0">
            <Link href="/customer/cart" className="relative">
              <ShoppingCart size={18} className="text-foreground" />
              {count > 0 && (
                <span className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full text-[9px] font-bold text-white flex items-center justify-center bg-destructive">
                  {count}
                </span>
              )}
            </Link>
            <Link href="/login" className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-full flex items-center justify-center font-bold text-xs text-white bg-primary">
                {currentUser.avatarInitial}
              </div>
              <span className="text-xs text-muted-foreground">Switch account</span>
            </Link>
          </div>
        </div>

        {/* Mobile bottom-ish secondary row for the rest of nav */}
        <div className="md:hidden flex items-center gap-4 px-4 pb-2 overflow-x-auto hide-scrollbar">
          {NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="relative flex items-center gap-1.5 text-xs font-medium whitespace-nowrap shrink-0"
              style={{ color: pathname.startsWith(item.href) ? "var(--primary)" : "var(--muted-foreground)" }}
            >
              <item.icon size={13} /> {item.label}
              {item.href === "/customer/support" && unreadTickets > 0 && (
                <span className="w-1.5 h-1.5 rounded-full bg-destructive" />
              )}
            </Link>
          ))}
        </div>
      </nav>

      <main className="flex-1">{children}</main>
      <ChatbotWidget />
    </div>
  );
}
