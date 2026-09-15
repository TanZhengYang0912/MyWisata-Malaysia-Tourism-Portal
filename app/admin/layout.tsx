"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { LogOut, Search } from "lucide-react";
import { useRequireRole } from "@/components/providers/auth";
import { createClient } from "@/lib/supabase/client";
import { AppearanceControl } from "@/components/shared/appearance-control";
import { useTranslation } from "react-i18next";
import { LanguageSwitcher } from "@/components/shared/language-switcher";
import { GlobalCommandPalette } from "@/components/shared/global-command-palette";
import { staffNavigationSections } from "@/lib/staff-permissions/navigation";
import { useCommandShortcutLabel } from "@/components/shared/command-shortcut";
import { PortalSidebar, type PortalSidebarSection } from "@/components/layout/portal-sidebar";

const UNREAD_POLL_MS = 30_000;

type PendingCounts = {
  vendors: number;
  catalogue: number;
  kyc: number;
  withdrawals: number;
  refunds: number;
  chatReports: number;
  recommendations: number;
};

const EMPTY_PENDING_COUNTS: PendingCounts = {
  vendors: 0,
  catalogue: 0,
  kyc: 0,
  withdrawals: 0,
  refunds: 0,
  chatReports: 0,
  recommendations: 0,
};

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const { currentUser, staffModules = [], loading } = useRequireRole(["admin", "approver", "staff", "super_admin"]);
  const { t: tAdmin } = useTranslation("admin");
  const { t: tCommon } = useTranslation("common");
  const commandShortcutLabel = useCommandShortcutLabel();

  const pathname = usePathname();
  const router = useRouter();
  const mainContentRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (mainContentRef.current) {
      mainContentRef.current.scrollTop = 0;
    }
  }, [pathname]);

  const dynamicNavigation = useMemo(() => staffNavigationSections(staffModules), [staffModules]);
  const navigationHrefs = useMemo(
    () => dynamicNavigation.flatMap((section) => section.items.map((item) => item.href)),
    [dynamicNavigation],
  );
  const outsideAssignedWork = Boolean(currentUser)
    && !navigationHrefs.some((href) => pathname === href || pathname.startsWith(`${href}/`));
  const supabase = useMemo(() => createClient(), []);
  // CLAUDE-FIXES-2.md item 1: a count on the Support Tickets nav item —
  // queue-wide, any ticket with an unread customer reply, not just mine.
  const [unreadTickets, setUnreadTickets] = useState(0);
  const [pendingCounts, setPendingCounts] = useState<PendingCounts>(EMPTY_PENDING_COUNTS);
  const [pendingCountsReady, setPendingCountsReady] = useState(false);
  const [unreadRecommendations, setUnreadRecommendations] = useState(0);
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);

  useEffect(() => {
    if (loading || !currentUser || !outsideAssignedWork) return;
    router.replace(currentUser.role === "staff" ? "/staff" : navigationHrefs[0] ?? "/login");
  }, [currentUser, loading, navigationHrefs, outsideAssignedWork, router]);

  async function signOut() {
    await supabase.auth.signOut();
    router.replace("/login");
    router.refresh();
  }

  useEffect(() => {
    if (!currentUser || currentUser.role === "approver") return;
    if (currentUser.role === "staff") return;
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
    void poll();
    const interval = setInterval(() => {
      if (document.visibilityState === "visible") {
        void poll();
      }
    }, UNREAD_POLL_MS);
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        void poll();
      }
    };
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      cancelled = true;
      clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [currentUser]);

  useEffect(() => {
    if (!currentUser || currentUser.role === "staff") return;
    let cancelled = false;
    async function pollPendingCounts() {
      try {
        const response = await fetch("/api/admin/navigation/counts");
        const body = (await response.json()) as { data?: Partial<PendingCounts> | null };
        if (!cancelled && response.ok && body.data) {
          setPendingCounts({ ...EMPTY_PENDING_COUNTS, ...body.data });
          setPendingCountsReady(true);
        }
      } catch {
        // best-effort — a failed poll leaves the last-known counts showing
      }
    }

    void pollPendingCounts();
    const interval = setInterval(() => {
      if (document.visibilityState === "visible") {
        void pollPendingCounts();
      }
    }, UNREAD_POLL_MS);
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        void pollPendingCounts();
      }
    };
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      cancelled = true;
      clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [currentUser]);

  useEffect(() => {
    if (currentUser?.role !== "super_admin") return;

    let cancelled = false;
    async function pollRecommendationUnread() {
      try {
        const response = await fetch("/api/admin/recommendations/unread-count");
        const body = (await response.json()) as { data?: { count?: number } | null };
        if (!cancelled && response.ok) {
          setUnreadRecommendations(body.data?.count ?? 0);
        }
      } catch {
        // best-effort — a failed poll leaves the last-known count showing
      }
    }

    void pollRecommendationUnread();
    const interval = setInterval(() => {
      if (document.visibilityState === "visible") {
        void pollRecommendationUnread();
      }
    }, UNREAD_POLL_MS);
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        void pollRecommendationUnread();
      }
    };
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      cancelled = true;
      clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [currentUser?.role]);

  if (loading || !currentUser || outsideAssignedWork) {
    return <div className="min-h-screen flex items-center justify-center text-muted-foreground text-sm">{tCommon("states.loadingEllipsis")}</div>;
  }

  function pendingCountFor(href: string) {
    if (href === "/admin/vendors") return pendingCounts.vendors;
    if (href === "/admin/catalogue") return pendingCounts.catalogue;
    if (href === "/admin/kyc") return pendingCounts.kyc;
    if (href === "/admin/withdrawals") return pendingCounts.withdrawals;
    if (href === "/admin/refunds") return pendingCounts.refunds;
    if (href === "/admin/chat-reports") return pendingCounts.chatReports;
    if (href === "/admin/recommendations") {
      return pendingCountsReady ? pendingCounts.recommendations : currentUser?.role === "super_admin" ? unreadRecommendations : 0;
    }
    return 0;
  }

  const sidebarSections = dynamicNavigation.map<PortalSidebarSection>((section) => ({
    label: section.labelKey ? tAdmin(section.labelKey) : section.label,
    items: section.items.map((item) => {
        // item.href === "/admin/recommendations" uses its pending queue count for Super Admins.
        const count = currentUser.role === "staff" ? 0 : item.href === "/admin/support" ? unreadTickets : pendingCountFor(item.href);
        return {
          href: item.href,
          label: item.labelKey ? tAdmin(item.labelKey) : item.label,
          icon: item.icon,
          count,
          countLabel: count > 0 ? tAdmin("accessibility.pendingItems", { count }) : undefined,
        };
      }),
  }));

  const commandNavigationItems = sidebarSections.flatMap((section, sectionIndex) => section.items.map((item) => ({
    id: `admin-module-${sectionIndex}-${item.href}`,
    title: typeof item.label === "string" ? item.label : String(item.label),
    category: typeof section.label === "string" ? section.label : String(section.label),
    href: item.href,
    icon: item.icon,
    badge: item.count,
  })));

  const contextDetail = currentUser.role === "super_admin"
    ? tAdmin("shell.context.superAdmin")
    : currentUser.role === "approver"
      ? tAdmin("shell.context.approver")
      : currentUser.role === "staff"
        ? tAdmin("shell.context.staff")
        : tAdmin("shell.context.admin");

  return (
    <div className="flex h-screen overflow-hidden">
      <PortalSidebar
        portalName={tAdmin("shell.portal")}
        brandName={tAdmin("shell.brand")}
        navigationLabel={tAdmin("shell.navigation")}
        contextLabel={tAdmin(`roles.${currentUser.role}`)}
        contextDetail={contextDetail}
        sections={sidebarSections}
      />
      <div ref={mainContentRef} data-scroll-container="admin-main" className="min-h-0 min-w-0 flex-1 overflow-x-hidden overflow-y-auto" style={{ backgroundColor: "var(--background)" }}>
        <header className="sticky top-0 z-40 flex h-16 items-center justify-end gap-2 bg-background/95 px-4 backdrop-blur-md sm:px-6">
          {currentUser.role !== "staff" && <button
            type="button"
            onClick={() => setCommandPaletteOpen(true)}
            aria-label={tCommon("command.openPalette")}
            className="mr-auto flex items-center gap-2 rounded-xl border border-border bg-card/70 px-3 py-1.5 text-xs text-muted-foreground transition hover:border-primary/40 hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <Search size={14} className="text-muted-foreground" />
            <span className="hidden sm:inline">{tCommon("command.searchAdminPlaceholder")}</span>
            <span className="sm:hidden">{tCommon("actions.search")}</span>
            <kbd className="ml-1 shrink-0 inline-flex items-center rounded border border-border bg-muted px-1.5 font-mono text-[10px] text-muted-foreground">{commandShortcutLabel}</kbd>
          </button>}
          <div className="flex items-center gap-2">
            <LanguageSwitcher compact className="w-28" />
            <AppearanceControl />
            <button
              type="button"
              onClick={() => void signOut()}
              aria-label={tCommon("actions.signOut")}
              className="inline-flex h-9 items-center gap-2 rounded-full border border-border bg-card/80 px-3 text-xs font-semibold text-foreground transition hover:border-primary/30 hover:bg-secondary"
            >
              <span className="max-w-32 truncate">{currentUser.name}</span>
              <LogOut size={15} aria-hidden="true" />
            </button>
          </div>
        </header>
        {children}
        {currentUser.role !== "staff" && <GlobalCommandPalette
          scope="admin"
          navigationItems={commandNavigationItems}
          triggerOpen={commandPaletteOpen}
          onOpenChange={setCommandPaletteOpen}
        />}
      </div>
    </div>
  );
}
