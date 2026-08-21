"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowRightLeft, ChevronDown, Globe, ShoppingCart, Tag } from "lucide-react";
import { useRequireRole } from "@/components/providers/auth";
import { useCart } from "@/components/providers/cart";
import { ChatbotWidget } from "@/components/shared/chatbot-widget";
import { HEADER_ICON_BUTTON_CLASS } from "@/components/shared/header-icon-button";
import { NotificationBell } from "@/components/shared/notification-bell";
import { AppearanceControl } from "@/components/shared/appearance-control";
import { LanguageSwitcher } from "@/components/shared/language-switcher";
import { useTranslation } from "react-i18next";
import { WishlistProvider, useWishlist } from "@/components/providers/wishlist";
import { SavedDestinationsProvider, useSavedDestinations } from "@/components/providers/saved-destinations";
import { TripProvider } from "@/components/providers/trip";
import { SupportChatProvider } from "@/components/providers/support-chat";
import { supabase } from "@/backend/supabase";
import { ACCOUNT_MENU_GROUPS, CUSTOMER_NAV, getCustomerDisplayName, isCustomerNavActive } from "@/lib/customer/header-navigation";
import { BRAND_NAME } from "@/lib/i18n/invariant-tokens";

const UNREAD_POLL_MS = 30_000;

export default function CustomerLayout({ children }: { children: React.ReactNode }) {
  return (
    <TripProvider>
      <WishlistProvider>
        <SavedDestinationsProvider>
          <SupportChatProvider>
            <CustomerLayoutInner>{children}</CustomerLayoutInner>
          </SupportChatProvider>
        </SavedDestinationsProvider>
      </WishlistProvider>
    </TripProvider>
  );
}

function CustomerLayoutInner({ children }: { children: React.ReactNode }) {
  const { currentUser, loading } = useRequireRole(["customer"]);
  const { count } = useCart();
  const { savedIds } = useWishlist();
  const { savedStates } = useSavedDestinations();
  const savedCount = savedIds.size + savedStates.size;
  const [tripCount, setTripCount] = useState(0);
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

  // Fetch actual trip count for the badge (reads from cookie-based mock store via API)
  useEffect(() => {
    if (!currentUser) return;
    let cancelled = false;
    async function loadTripCount() {
      try {
        const res = await fetch("/api/trips/count");
        if (!cancelled && res.ok) {
          const body = await res.json() as { count: number };
          setTripCount(body.count);
        }
      } catch {
        // best-effort
      }
    }
    void loadTripCount();
    return () => { cancelled = true; };
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

  const { t: tCommon } = useTranslation("common");
  const { t: tCustomer } = useTranslation("customer");

  async function switchAccount() {
    setAccountMenuOpen(false);
    const { error } = await supabase.auth.signOut();
    if (error) return;
    window.location.assign("/login");
  }

  if (loading || !currentUser) {
    return <div className="min-h-screen flex items-center justify-center text-muted-foreground text-sm">{tCommon("states.loadingEllipsis")}</div>;
  }

  const customerDisplayName = getCustomerDisplayName(currentUser, tCommon("strictMigration.accountFallbackName"));

  return (
    <div className="min-h-screen flex flex-col" style={{ backgroundColor: "var(--background)" }}>
      <nav className="sticky top-0 z-40 border-b border-border bg-background/95 backdrop-blur-md print:hidden">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 flex items-center gap-4 sm:gap-8 h-16">
          <Link href="/customer" className="flex items-center gap-2 shrink-0">
            <div className="w-8 h-8 rounded-xl flex items-center justify-center bg-primary">
              <Globe size={16} className="text-white" />
            </div>
            <span className="font-bold text-base text-foreground font-[family-name:var(--font-display)]">{BRAND_NAME}</span>
          </Link>

          <div className="hidden flex-1 items-center gap-5 md:flex xl:gap-6">
            {CUSTOMER_NAV.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="relative flex items-center gap-1.5 text-sm font-medium transition-colors hover:opacity-70"
                aria-current={isCustomerNavActive(pathname, item.href) ? "page" : undefined}
                style={{ color: isCustomerNavActive(pathname, item.href) ? "var(--primary)" : "var(--muted-foreground)" }}
              >
                <span>{tCustomer(item.labelKey)}</span>
                {item.href === "/customer/trip" && tripCount > 0 && (
                  <span className="absolute -right-2.5 -top-1.5 min-w-4 rounded-full bg-primary px-1 text-center text-[0.5625rem] font-bold leading-4 text-white">{tripCount > 99 ? "99+" : tripCount}</span>
                )}
                {item.href === "/customer/chat" && unreadChats > 0 && (
                  <span className="absolute -right-2.5 -top-1.5 min-w-4 rounded-full bg-primary px-1 text-center text-[0.5625rem] font-bold leading-4 text-white">{unreadChats > 99 ? "99+" : unreadChats}</span>
                )}
                {item.href === "/customer/saved" && savedCount > 0 && (
                  <span className="absolute -right-2.5 -top-1.5 min-w-4 rounded-full bg-primary px-1 text-center text-[0.5625rem] font-bold leading-4 text-white">{savedCount > 99 ? "99+" : savedCount}</span>
                )}
              </Link>
            ))}
          </div>

          <div className="ml-auto flex shrink-0 items-center gap-1">
            <LanguageSwitcher compact className="hidden md:flex w-28" />
            <AppearanceControl />
            <NotificationBell />
            <Link
              href="/customer/cart"
              aria-label={count > 0
                ? tCommon(count === 1 ? "cart.itemCount" : "cart.itemCountPlural", { count })
                : tCommon("cart.label")}
              className={HEADER_ICON_BUTTON_CLASS}
            >
              <ShoppingCart size={18} className="text-foreground" />
              {count > 0 && (
                <span className="absolute -right-1 -top-1 min-w-4 rounded-full bg-primary px-1 text-center text-[0.5625rem] font-bold leading-4 text-white">
                  {count > 99 ? "99+" : count}
                </span>
              )}
            </Link>
            <Link href="/customer/vouchers" aria-label={tCustomer("accountItems.vouchers.label")} className="hidden items-center gap-1.5 rounded-full px-3 py-2 text-xs font-semibold text-foreground transition hover:bg-secondary lg:inline-flex">
              <Tag size={16} className="text-primary" /> {tCustomer("accountItems.vouchers.label")}
            </Link>
          </div>

          <div ref={accountMenuRef} className="relative flex h-full shrink-0 items-center">
            <button
              type="button"
              onClick={() => setAccountMenuOpen((open) => !open)}
              aria-expanded={accountMenuOpen}
              aria-haspopup="menu"
              aria-label={currentUser
                ? tCommon("account.openMenuFor", { name: customerDisplayName })
                : tCommon("account.guestMenu")}
              className="flex items-center gap-2 rounded-full border border-border bg-card/80 p-1.5 pr-2 transition hover:border-primary/30 hover:bg-secondary"
            >
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-xs font-bold text-white">
                {currentUser.avatarInitial}
              </span>
              <span className="hidden max-w-28 truncate text-xs font-semibold text-foreground lg:inline">{customerDisplayName}</span>
              <ChevronDown size={14} className={`text-muted-foreground transition-transform ${accountMenuOpen ? "rotate-180" : ""}`} />
            </button>

            {accountMenuOpen && (
              // max-height derived from the real, known layout numbers, not a
              // guessed px: the nav row is h-16 (4rem) and this menu opens
              // top-[calc(100%+0.75rem)] below it, so 4.75rem is exactly how
              // far down the viewport this menu's own top edge sits — plus a
              // little breathing room so it doesn't touch the viewport edge.
              // overflow-y-auto only shows a scrollbar once content actually
              // exceeds that height; overflow-x-hidden keeps the rounded
              // corners clean now that overflow-hidden (which clipped both
              // axes but allowed no scrolling at all) is gone.
              <div
                role="menu"
                aria-label={tCommon("account.menu")}
                className="thin-scrollbar absolute right-0 top-[calc(100%+0.75rem)] z-50 w-80 max-w-[calc(100vw-2rem)] overflow-x-hidden overflow-y-auto rounded-2xl border border-border bg-card p-2 shadow-[0_18px_45px_rgba(1,0,102,0.16)]"
                style={{ maxHeight: "calc(100vh - 5.75rem)" }}
              >
                <div className="border-b border-border px-3 pb-3 pt-2">
                  <p className="truncate text-sm font-bold text-foreground">{customerDisplayName}</p>
                  <p className="mt-1 truncate text-xs text-muted-foreground">{currentUser.email}</p>
                </div>
                <div className="pt-2">
                  {ACCOUNT_MENU_GROUPS.map((group) => (
                    <div key={group.labelKey} className="not-first:mt-2">
                      <p className="px-3 pb-1 pt-2 text-[0.625rem] font-bold uppercase tracking-[0.14em] text-muted-foreground">{tCustomer(group.labelKey)}</p>
                      {group.items.map((item) => {
                        const active = isCustomerNavActive(pathname, item.href);
                        return (
                          <Link
                            key={item.href}
                            href={item.href}
                            role="menuitem"
                            aria-current={active ? "page" : undefined}
                            onClick={() => setAccountMenuOpen(false)}
                            className={`flex items-center gap-3 rounded-xl px-3 py-2.5 transition hover:bg-secondary ${active ? "bg-secondary" : ""}`}
                          >
                            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-secondary text-primary">
                              <item.icon size={16} />
                            </span>
                            <span className="min-w-0">
                              <span className="flex items-center gap-2 text-sm font-semibold text-foreground">
                                {tCustomer(`${item.labelKey}.label`)}
                                {item.href === "/customer/support" && unreadTickets > 0 && <span className="h-1.5 w-1.5 rounded-full bg-primary" />}
                              </span>
                              <span className="block truncate text-[0.6875rem] text-muted-foreground">{tCustomer(`${item.labelKey}.description`)}</span>
                            </span>
                          </Link>
                        );
                      })}
                    </div>
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
                    {tCommon("account.switchAccount")}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Mobile bottom-ish secondary row for the rest of nav */}
        <div className="flex items-center gap-4 overflow-x-auto px-4 pb-2 hide-scrollbar md:hidden">
          <Link href="/customer/vouchers" aria-label={tCustomer("accountItems.vouchers.label")} className="flex shrink-0 items-center gap-1.5 text-xs font-medium whitespace-nowrap" aria-current={isCustomerNavActive(pathname, "/customer/vouchers") ? "page" : undefined} style={{ color: isCustomerNavActive(pathname, "/customer/vouchers") ? "var(--primary)" : "var(--muted-foreground)" }}><Tag size={13} /> {tCustomer("accountItems.vouchers.label")}</Link>
          {CUSTOMER_NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="relative flex items-center gap-1.5 text-xs font-medium whitespace-nowrap shrink-0"
              aria-current={isCustomerNavActive(pathname, item.href) ? "page" : undefined}
              style={{ color: isCustomerNavActive(pathname, item.href) ? "var(--primary)" : "var(--muted-foreground)" }}
            >
              <item.icon size={13} /> {tCustomer(item.labelKey)}
              {item.href === "/customer/trip" && tripCount > 0 && (
                <span className="absolute -right-2 -top-1.5 min-w-4 rounded-full bg-primary px-1 text-center text-[0.5625rem] font-bold leading-4 text-white">{tripCount > 99 ? "99+" : tripCount}</span>
              )}
              {item.href === "/customer/chat" && unreadChats > 0 && (
                <span className="absolute -right-2 -top-1.5 min-w-4 rounded-full bg-primary px-1 text-center text-[0.5625rem] font-bold leading-4 text-white">{unreadChats > 99 ? "99+" : unreadChats}</span>
              )}
              {item.href === "/customer/saved" && savedCount > 0 && (
                <span className="absolute -right-2 -top-1.5 min-w-4 rounded-full bg-primary px-1 text-center text-[0.5625rem] font-bold leading-4 text-white">{savedCount > 99 ? "99+" : savedCount}</span>
              )}
            </Link>
          ))}
        </div>
      </nav>

      <main className="flex-1 min-h-0">{children}</main>
      {!pathname.startsWith("/customer/chat") && <ChatbotWidget />}
    </div>
  );
}
