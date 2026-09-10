"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Activity, ClipboardCheck, Flag, Gem, Inbox, LogOut, Package, Search, Shield, DollarSign, Link2, Bot, Sparkles, UserX, UsersRound, Settings2, FileBarChart2, RotateCcw, UserRoundCheck, ShieldCog, Megaphone, type LucideIcon } from "lucide-react";
import { useRequireRole } from "@/components/providers/auth";
import { createClient } from "@/lib/supabase/client";
import { AppearanceControl } from "@/components/shared/appearance-control";
import { useTranslation } from "react-i18next";
import { LanguageSwitcher } from "@/components/shared/language-switcher";
import { GlobalCommandPalette } from "@/components/shared/global-command-palette";
import { isWalletApproverPath } from "@/lib/auth/post-login-destination";
import { staffDestinations } from "@/lib/staff-permissions/navigation";
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

const CONTENT_REVIEW_ROLES = ["admin", "super_admin"] as const;
const WITHDRAWAL_REVIEW_ROLES = ["approver", "super_admin"] as const;

type AdminNavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  superAdminOnly?: boolean;
  allowedRoles?: readonly string[];
};

type AdminNavSection = { labelKey: string; items: AdminNavItem[] };

const NAV_SECTIONS: AdminNavSection[] = [
  { labelKey: "workspace", items: [{ href: "/admin/dashboard", label: "Overview", icon: Activity }] },
  {
    labelKey: "governance",
    items: [
      { href: "/admin/vendors", label: "Vendor Approvals", icon: Package },
      { href: "/admin/catalogue", label: "Catalogue Review", icon: ClipboardCheck },
      { href: "/admin/sponsored-placements", label: "Sponsored Placements", icon: Megaphone, allowedRoles: CONTENT_REVIEW_ROLES },
      { href: "/admin/kyc", label: "KYC Review", icon: Shield, allowedRoles: CONTENT_REVIEW_ROLES },
      { href: "/admin/recommendations", label: "Recommendations", icon: Gem, allowedRoles: CONTENT_REVIEW_ROLES },
    ],
  },
  {
    labelKey: "finance",
    items: [
      { href: "/admin/withdrawals", label: "Withdrawals", icon: DollarSign, allowedRoles: WITHDRAWAL_REVIEW_ROLES },
      { href: "/admin/refunds", label: "Refunds", icon: RotateCcw },
      { href: "/admin/wallet/settings", label: "Wallet Settings", icon: Settings2, superAdminOnly: true },
      { href: "/admin/wallet/approvers", label: "Wallet Approvers", icon: UserRoundCheck, superAdminOnly: true },
      { href: "/admin/reports/payouts", label: "Payout Reports", icon: FileBarChart2, superAdminOnly: true },
    ],
  },
  {
    labelKey: "support",
    items: [
      { href: "/admin/support", label: "Support Tickets", icon: Inbox },
      { href: "/admin/chat-reports", label: "Chat Reports", icon: Flag },
      { href: "/admin/affiliate", label: "Affiliate", icon: Link2 },
      { href: "/admin/chatbot", label: "Chatbot", icon: Bot },
    ],
  },
  {
    labelKey: "administration",
    items: [
      { href: "/admin/users", label: "User Management", icon: UsersRound, superAdminOnly: true },
      { href: "/admin/access-control", label: "Access Control", icon: ShieldCog, superAdminOnly: true },
      // CLAUDE-ADMIN-AI.md: "Gate on super_admin" — stricter than the rest of
      // this NAV. Filtered in render below.
      { href: "/admin/ai-assistant", label: "AI Assistant", icon: Sparkles, superAdminOnly: true },
      // CLAUDE-SUPPORT-MUTE-REPORT.md Feature 4: moved out of the AI Assistant
      // page into its own nav entry — it's staff-conduct review, not an AI
      // capability, and was only ever co-located there because that page was
      // already super-admin-gated.
      { href: "/admin/staff-conduct", label: "Staff Conduct", icon: UserX, superAdminOnly: true },
    ],
  },
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const { currentUser, staffPermissionKeys = [], loading } = useRequireRole(["admin", "approver", "staff", "super_admin"]);
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

  const approverOutsideWallet = currentUser?.role === "approver" && !isWalletApproverPath(pathname);
  const staffNavigationHrefs = new Set(staffDestinations(staffPermissionKeys).map((destination) => destination.href));
  const staffOutsideAssignedWork = currentUser?.role === "staff"
    && ![...staffNavigationHrefs].some((href) => pathname === href || pathname.startsWith(`${href}/`));
  const supabase = useMemo(() => createClient(), []);
  // CLAUDE-FIXES-2.md item 1: a count on the Support Tickets nav item —
  // queue-wide, any ticket with an unread customer reply, not just mine.
  const [unreadTickets, setUnreadTickets] = useState(0);
  const [pendingCounts, setPendingCounts] = useState<PendingCounts>(EMPTY_PENDING_COUNTS);
  const [pendingCountsReady, setPendingCountsReady] = useState(false);
  const [unreadRecommendations, setUnreadRecommendations] = useState(0);
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);

  useEffect(() => {
    if (!loading && approverOutsideWallet) router.replace("/admin/withdrawals");
  }, [loading, approverOutsideWallet, router]);

  useEffect(() => {
    if (!loading && staffOutsideAssignedWork) router.replace("/staff");
  }, [loading, router, staffOutsideAssignedWork]);

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

  if (loading || !currentUser || approverOutsideWallet || staffOutsideAssignedWork) {
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

  const sidebarSections = NAV_SECTIONS.map<PortalSidebarSection>((section) => ({
    label: tAdmin(`navigationSections.${section.labelKey}`),
    items: section.items
      .filter((item) =>
        (currentUser.role !== "staff" || staffNavigationHrefs.has(item.href))
        && (!item.superAdminOnly || currentUser.role === "super_admin")
        && (currentUser.role === "staff" || !item.allowedRoles || item.allowedRoles.includes(currentUser.role))
        && (currentUser.role !== "approver" || isWalletApproverPath(item.href)),
      )
      .map((item) => {
        // item.href === "/admin/recommendations" uses its pending queue count for Super Admins.
        const count = currentUser.role === "staff" ? 0 : item.href === "/admin/support" ? unreadTickets : pendingCountFor(item.href);
        return {
          href: item.href,
          label: tAdmin(`navigation.${item.label}`),
          icon: item.icon,
          count,
          countLabel: count > 0 ? tAdmin("accessibility.pendingItems", { count }) : undefined,
        };
      }),
  })).filter((section) => section.items.length > 0);

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
          userRole={currentUser.role}
          pendingCounts={pendingCounts}
          triggerOpen={commandPaletteOpen}
          onOpenChange={setCommandPaletteOpen}
        />}
      </div>
    </div>
  );
}
