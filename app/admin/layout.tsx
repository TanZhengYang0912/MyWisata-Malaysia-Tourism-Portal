"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { LifeBuoy, LogOut, Search } from "lucide-react";
import { useRequireRole } from "@/components/providers/auth";
import { createClient } from "@/lib/supabase/client";
import { staffVerificationDestination } from "@/lib/auth/staff-route-boundaries";
import { AppearanceControl } from "@/components/shared/appearance-control";
import { useTranslation } from "react-i18next";
import { LanguageSwitcher } from "@/components/shared/language-switcher";
import { GlobalCommandPalette } from "@/components/shared/global-command-palette";
import { staffNavigationSections } from "@/lib/staff-permissions/navigation";
import { useCommandShortcutLabel } from "@/components/shared/command-shortcut";
import { PortalSidebar, type PortalSidebarSection } from "@/components/layout/portal-sidebar";
import { NotificationBell } from "@/components/shared/notification-bell";
import { AdminQueueSummaryProvider } from "@/app/admin/admin-queue-summary-context";
import type { AdminDashboardSummary } from "@/lib/admin/queue-summary";
import { AdminMobileActions } from "@/components/admin/admin-mobile-actions";

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
  const { currentUser, staffPermissionKeys = [], staffModules = [], staffPermissionExpiresAt, refreshUser, staffVerified, staffPasskeyRequired = true, staffMfaRequired = false, loading } = useRequireRole(["admin", "approver", "staff", "super_admin"]);
  const staffAccessReady = !staffMfaRequired && (!staffPasskeyRequired || staffVerified);
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
  // /admin/security is where unverified staff sessions are sent to enter their
  // authenticator code (lib/supabase/proxy.ts), so it is open to every staff role.
  // /admin/help and its guides filter their own content to the staff member's menu.
  const outsideAssignedWork = Boolean(currentUser)
    && pathname !== "/admin/security"
    && pathname !== "/admin/notifications"
    && pathname !== "/admin/help"
    && !pathname.startsWith("/admin/help/")
    && !navigationHrefs.some((href) => pathname === href || pathname.startsWith(`${href}/`));
  const supabase = useMemo(() => createClient(), []);

  useEffect(() => {
    if (!staffPermissionExpiresAt) return;
    const expiresAt = Date.parse(staffPermissionExpiresAt);
    if (!Number.isFinite(expiresAt)) return;
    const refreshIfExpired = () => {
      if (document.visibilityState === "visible" && Date.now() >= expiresAt) void refreshUser();
    };
    const timeout = window.setTimeout(() => { void refreshUser(); }, Math.max(0, expiresAt - Date.now() + 50));
    window.addEventListener("focus", refreshIfExpired);
    document.addEventListener("visibilitychange", refreshIfExpired);
    return () => {
      window.clearTimeout(timeout);
      window.removeEventListener("focus", refreshIfExpired);
      document.removeEventListener("visibilitychange", refreshIfExpired);
    };
  }, [refreshUser, staffPermissionExpiresAt]);
  // CLAUDE-FIXES-2.md item 1: a count on the Support Tickets nav item —
  // queue-wide, any ticket with an unread customer reply, not just mine.
  const [unreadTickets, setUnreadTickets] = useState(0);
  const [pendingCounts, setPendingCounts] = useState<PendingCounts>(EMPTY_PENDING_COUNTS);
  const [pendingCountsReady, setPendingCountsReady] = useState(false);
  const [dashboardSummary, setDashboardSummary] = useState<AdminDashboardSummary | null>(null);
  const [dashboardSummaryError, setDashboardSummaryError] = useState(false);
  const [dashboardSummaryOwner, setDashboardSummaryOwner] = useState<string | null>(null);
  const [dashboardErrorOwner, setDashboardErrorOwner] = useState<string | null>(null);
  const [pendingCountsOwner, setPendingCountsOwner] = useState<string | null>(null);
  const pendingPollRef = useRef<(() => void) | null>(null);
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
    if (!staffAccessReady || !currentUser || currentUser.role === "approver") return;
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
  }, [currentUser, staffAccessReady]);

  useEffect(() => {
    if (!staffAccessReady || !currentUser) {
      pendingPollRef.current = null;
      return;
    }
    let cancelled = false;
    let inFlight = false;
    const controller = new AbortController();
    const includeSummary = pathname === "/admin" || pathname === "/admin/dashboard";
    const currentUserId = currentUser.id;
    async function pollPendingCounts() {
      if (inFlight) return;
      inFlight = true;
      try {
        const response = await fetch(`/api/admin/navigation/counts${includeSummary ? "?view=dashboard" : ""}`, { signal: controller.signal, cache: "no-store" });
        const body = (await response.json()) as { data?: (Partial<PendingCounts> & { summary?: AdminDashboardSummary }) | null };
        if (!cancelled && response.ok && body.data) {
          setPendingCounts({ ...EMPTY_PENDING_COUNTS, ...body.data });
          setPendingCountsOwner(currentUserId);
          setPendingCountsReady(true);
          if (includeSummary && body.data.summary) {
            setDashboardSummary(body.data.summary);
            setDashboardSummaryOwner(currentUserId);
            setDashboardSummaryError(false);
            setDashboardErrorOwner(currentUserId);
          } else if (includeSummary) {
            setDashboardSummaryError(true);
            setDashboardErrorOwner(currentUserId);
          }
        } else if (!cancelled && includeSummary) {
          setDashboardSummaryError(true);
          setDashboardErrorOwner(currentUserId);
        }
      } catch {
        // best-effort — a failed poll leaves the last-known counts showing
        if (!cancelled && includeSummary) {
          setDashboardSummaryError(true);
          setDashboardErrorOwner(currentUserId);
        }
      } finally {
        inFlight = false;
      }
    }

    pendingPollRef.current = () => { void pollPendingCounts(); };
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
      controller.abort();
      pendingPollRef.current = null;
      clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [currentUser, pathname, staffAccessReady]);

  useEffect(() => {
    if (!staffAccessReady || currentUser?.role !== "super_admin") return;

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
  }, [currentUser?.role, staffAccessReady]);

  const dashboardContext = useMemo(() => ({
    summary: pathname === "/admin" || pathname === "/admin/dashboard"
      ? dashboardSummaryOwner === currentUser?.id ? dashboardSummary : null
      : null,
    error: dashboardErrorOwner === currentUser?.id && dashboardSummaryError,
    refresh: () => pendingPollRef.current?.(),
  }), [currentUser?.id, dashboardErrorOwner, dashboardSummary, dashboardSummaryError, dashboardSummaryOwner, pathname]);

  if (loading || !currentUser || !staffAccessReady || outsideAssignedWork) {
    return <div className="min-h-screen flex items-center justify-center text-muted-foreground text-sm">{tCommon("states.loadingEllipsis")}</div>;
  }
  const activeUser = currentUser;

  function pendingCountFor(href: string) {
    const currentCounts = pendingCountsOwner === activeUser.id ? pendingCounts : EMPTY_PENDING_COUNTS;
    if (href === "/admin/vendors") return currentCounts.vendors;
    if (href === "/admin/catalogue") return currentCounts.catalogue;
    if (href === "/admin/kyc") return currentCounts.kyc;
    if (href === "/admin/withdrawals") return currentCounts.withdrawals;
    if (href === "/admin/refunds") return currentCounts.refunds;
    if (href === "/admin/chat-reports") return currentCounts.chatReports;
    if (href === "/admin/recommendations") {
      return pendingCountsOwner === activeUser.id && pendingCountsReady ? currentCounts.recommendations : activeUser.role === "super_admin" ? unreadRecommendations : 0;
    }
    return 0;
  }

  const sidebarSections = dynamicNavigation.map<PortalSidebarSection>((section) => ({
    label: section.labelKey ? tAdmin(section.labelKey) : section.label,
    items: section.items.map((item) => {
        // item.href === "/admin/recommendations" uses its pending queue count for Super Admins.
        const count = item.href === "/admin/support" ? unreadTickets : pendingCountFor(item.href);
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
    <AdminQueueSummaryProvider value={dashboardContext}>
    <div className="flex h-screen overflow-hidden">
      <PortalSidebar
        portalName={tAdmin("shell.portal")}
        brandName={tAdmin("shell.brand")}
        navigationLabel={tAdmin("shell.navigation")}
        contextLabel={tAdmin(`roles.${currentUser.role}`)}
        contextDetail={contextDetail}
        sections={sidebarSections}
        menuLabel={tCommon("accessibility.openNavigation")}
        fixed
      />
      <div ref={mainContentRef} data-scroll-container="admin-main" className="min-h-0 min-w-0 flex-1 overflow-x-hidden overflow-y-auto lg:ml-60" style={{ backgroundColor: "var(--background)" }}>
        <header className="sticky top-0 z-40 flex h-16 items-center justify-end gap-2 bg-background/95 pl-16 pr-4 backdrop-blur-md sm:pr-6 lg:pl-6">
          {currentUser.role !== "staff" && <button
            type="button"
            onClick={() => setCommandPaletteOpen(true)}
            aria-label={tCommon("command.openPalette")}
            className="mr-auto inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-border bg-card/70 text-xs text-muted-foreground transition hover:border-primary/40 hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring lg:h-9 lg:w-auto lg:justify-start lg:gap-2 lg:px-3 lg:py-1.5"
          >
            <Search size={18} className="text-muted-foreground lg:size-3.5" />
            <span className="hidden lg:inline">{tCommon("command.searchAdminPlaceholder")}</span>
            <kbd className="ml-1 hidden shrink-0 items-center rounded border border-border bg-muted px-1.5 font-mono text-[10px] text-muted-foreground xl:inline-flex">{commandShortcutLabel}</kbd>
          </button>}
          {staffPermissionKeys.includes("admin.withdrawal.approve") && <NotificationBell scope="staff" allHref="/admin/notifications" />}
          <div className="hidden items-center gap-2 lg:flex">
            <Link
              href="/admin/help"
              aria-label={tAdmin("staffHelp.headerLink")}
              title={tAdmin("staffHelp.headerLink")}
              className="inline-flex h-9 items-center gap-1.5 rounded-full border border-border bg-card/80 px-3 text-xs font-semibold text-foreground transition hover:border-primary/30 hover:bg-secondary"
            >
              <LifeBuoy size={15} aria-hidden="true" />
              <span className="hidden sm:inline">{tAdmin("staffHelp.headerLink")}</span>
            </Link>
            <LanguageSwitcher compact className="w-28" />
            <AppearanceControl />
            {staffPasskeyRequired && <Link href={staffVerificationDestination(pathname)} className="rounded-full border border-border px-3 py-2 text-xs font-semibold text-foreground">{tAdmin("passkey.manage")}</Link>}
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
          <div className="lg:hidden">
            <AdminMobileActions
              displayName={currentUser.name}
              manageDevicesHref={staffPasskeyRequired ? staffVerificationDestination(pathname) : ""}
              onSignOut={() => void signOut()}
            />
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
    </AdminQueueSummaryProvider>
  );
}
