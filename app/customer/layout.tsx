"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowRightLeft, ChevronDown, Gift, Globe, Heart, Inbox, Map, MessageCircle, Search, ShoppingCart, ReceiptText, ShieldCheck, Star, Store, UserRound, WalletCards } from "lucide-react";
import { useRequireRole } from "@/components/providers/auth";
import { useCart } from "@/components/providers/cart";
import { ChatbotWidget } from "@/components/shared/chatbot-widget";
import { WishlistProvider } from "@/components/providers/wishlist";
import { TripProvider, useTrip } from "@/components/providers/trip";
import { supabase } from "@/backend/supabase";

const UNREAD_POLL_MS = 30_000;

const NAV = [
  { href: "/customer/for-you", label: "For You", icon: Star },
  { href: "/customer/explore", label: "Explore", icon: Search },
  { href: "/customer/map", label: "Map", icon: Map },
  { href: "/customer/chat", label: "Chat", icon: MessageCircle },
  { href: "/customer/activity?tab=itinerary", label: "My Activity", icon: ReceiptText },
];

const ACCOUNT_NAV = [
  { href: "/customer/profile", label: "Profile", description: "Your personal details", icon: UserRound },
  { href: "/customer/wishlist", label: "Saved Experiences", description: "Your travel shortlist", icon: Heart },
  { href: "/customer/kyc", label: "KYC Verification", description: "Verify your identity", icon: ShieldCheck },
  { href: "/customer/wallet", label: "My Wallet", description: "Balance and payouts", icon: WalletCards },
  { href: "/customer/profile/register-vendor", label: "Become a Vendor", description: "Apply to list your business", icon: Store },
  { href: "/customer/recommendations", label: "Recommend a Vendor", description: "Share local discoveries", icon: Star },
  { href: "/customer/affiliate", label: "Earn & Share", description: "Manage affiliate activity", icon: Gift },
  { href: "/customer/support", label: "Support", description: "Get help with your trip", icon: Inbox },
];

export default function CustomerLayout({ children }: { children: React.ReactNode }) {
  return (
    <TripProvider>
      <CustomerLayoutInner>{children}</CustomerLayoutInner>
    </TripProvider>
  );
}

function CustomerLayoutInner({ children }: { children: React.ReactNode }) {
  const { currentUser, loading } = useRequireRole(["customer"]);
  const { count } = useCart();
  const { stops: tripStops } = useTrip();
  const pathname = usePathname();
  const accountMenuRef = useRef<HTMLDivElement>(null);
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  // CLAUDE-FIXES-2.md item 1: a dot on the Support account item when there's an
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

  const [unreadChats, setUnreadChats] = useState(0);

  useEffect(() => {
    if (!currentUser) return;
    let cancelled = false;
    async function load() {
      try {
        const res = await fetch("/api/chat/unread-count");
        const body = (await res.json()) as { data: { count: number } | null };
        if (!cancelled && res.ok && body.data) setUnreadChats(body.data.count);
      } catch {
        // best-effort — a failed refresh just leaves the last-known count showing
      }
    }
    void load();
    const channel = supabase
      .channel(`nav-chat-unread-${currentUser.id}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "chat_messages" }, () => void load())
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "chat_message_reads" }, () => void load())
      .subscribe();
    return () => {
      cancelled = true;
      void supabase.removeChannel(channel);
    };
  }, [currentUser]);

  useEffect(() => {
    if (!accountMenuOpen) return;

    function closeOnOutsideClick(event: PointerEvent) {
      if (accountMenuRef.current && !accountMenuRef.current.contains(event.target as Node)) {
        setAccountMenuOpen(false);
      }
    }

    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") setAccountMenuOpen(false);
    }

    document.addEventListener("pointerdown", closeOnOutsideClick);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsideClick);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [accountMenuOpen]);

  async function switchAccount() {
    setAccountMenuOpen(false);
    const { error } = await supabase.auth.signOut();
    if (error) return;
    window.location.assign("/login");
  }

  if (loading || !currentUser) {
    return <div className="min-h-screen flex items-center justify-center text-muted-foreground text-sm">Loading…</div>;
  }

  return (
    <div className="min-h-screen flex flex-col" style={{ backgroundColor: "var(--background)" }}>
      <nav className="sticky top-0 z-40 border-b border-border bg-background/95 backdrop-blur-md print:hidden">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 flex items-center gap-4 sm:gap-8 h-16">
          <Link href="/customer" className="flex items-center gap-2 shrink-0">
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
                {item.href === "/customer/chat" && unreadChats > 0 && (
                  <span className="absolute -top-1 -right-2 w-2 h-2 rounded-full bg-destructive" />
                )}
                {item.href === "/customer/map" && tripStops.length > 0 && (
                  <span className="absolute -top-1.5 -right-3 rounded-full bg-primary px-1 text-[9px] font-bold leading-[14px] text-white">{tripStops.length}</span>
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
          </div>

          <div ref={accountMenuRef} className="relative shrink-0">
            <Link href="/customer/profile#preferences" className="mr-3 hidden text-sm font-medium text-muted-foreground transition hover:text-primary lg:inline">Preferences</Link>
            <button
              type="button"
              onClick={() => setAccountMenuOpen((open) => !open)}
              aria-expanded={accountMenuOpen}
              aria-haspopup="menu"
              aria-label="Open My Account menu"
              className="flex items-center gap-2 rounded-full border border-border bg-white/80 p-1.5 pr-2 transition hover:border-primary/30 hover:bg-secondary"
            >
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-xs font-bold text-white">
                {currentUser.avatarInitial}
              </span>
              <span className="hidden text-xs font-semibold text-foreground lg:inline">My Account</span>
              <ChevronDown size={14} className={`text-muted-foreground transition-transform ${accountMenuOpen ? "rotate-180" : ""}`} />
            </button>

            {accountMenuOpen && (
              <div role="menu" aria-label="My Account" className="absolute right-0 top-[calc(100%+0.75rem)] z-50 w-72 overflow-hidden rounded-2xl border border-border bg-white p-2 shadow-[0_18px_45px_rgba(1,0,102,0.16)]">
                <div className="border-b border-border px-3 pb-3 pt-2">
                  <p className="text-sm font-bold text-foreground">My Account</p>
                  <p className="mt-1 text-xs text-muted-foreground">Manage your profile and member tools</p>
                </div>
                <div className="pt-2">
                  {ACCOUNT_NAV.map((item) => (
                    <Link
                      key={item.href}
                      href={item.href}
                      role="menuitem"
                      onClick={() => setAccountMenuOpen(false)}
                      className="flex items-center gap-3 rounded-xl px-3 py-2.5 transition hover:bg-secondary"
                    >
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-secondary text-primary">
                        <item.icon size={16} />
                      </span>
                      <span className="min-w-0">
                        <span className="flex items-center gap-2 text-sm font-semibold text-foreground">
                          {item.label}
                          {item.href === "/customer/support" && unreadTickets > 0 && <span className="h-1.5 w-1.5 rounded-full bg-destructive" />}
                        </span>
                        <span className="block truncate text-[11px] text-muted-foreground">{item.description}</span>
                      </span>
                    </Link>
                  ))}
                </div>
                <div className="mt-2 border-t border-border pt-2">
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => void switchAccount()}
                    className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-semibold text-muted-foreground transition hover:bg-secondary hover:text-primary"
                  >
                    <ArrowRightLeft size={16} />
                    Switch account
                  </button>
                </div>
              </div>
            )}
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
              {item.href === "/customer/chat" && unreadChats > 0 && (
                <span className="w-1.5 h-1.5 rounded-full bg-destructive" />
              )}
              {item.href === "/customer/map" && tripStops.length > 0 && (
                <span className="rounded-full bg-primary px-1 text-[9px] font-bold leading-[14px] text-white">{tripStops.length}</span>
              )}
            </Link>
          ))}
        </div>
      </nav>

      <main className="flex-1 min-h-0"><WishlistProvider>{children}</WishlistProvider></main>
      {!pathname.startsWith("/customer/chat") && <ChatbotWidget />}
    </div>
  );
}
