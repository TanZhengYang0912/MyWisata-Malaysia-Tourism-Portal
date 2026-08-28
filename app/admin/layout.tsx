"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Activity, ClipboardCheck, Flag, Gem, Inbox, LogOut, Package, Shield, DollarSign, Link2, Bot, Sparkles, UserX, UsersRound, Settings2, FileBarChart2, RotateCcw, UserRoundCheck } from "lucide-react";
import { useRequireRole } from "@/components/providers/auth";
import { createClient } from "@/lib/supabase/client";
import { AppearanceControl } from "@/components/shared/appearance-control";
import { useTranslation } from "react-i18next";
import { LanguageSwitcher } from "@/components/shared/language-switcher";
import { BRAND_NAME } from "@/lib/i18n/invariant-tokens";

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
  icon: typeof Activity;
  superAdminOnly?: boolean;
  allowedRoles?: readonly string[];
};

const NAV: AdminNavItem[] = [
  { href: "/admin/dashboard", label: "Overview", icon: Activity },
  { href: "/admin/vendors", label: "Vendor Approvals", icon: Package },
  { href: "/admin/catalogue", label: "Catalogue Review", icon: ClipboardCheck },
  { href: "/admin/users", label: "User Management", icon: UsersRound, superAdminOnly: true },
  { href: "/admin/kyc", label: "KYC Review", icon: Shield, allowedRoles: CONTENT_REVIEW_ROLES },
  { href: "/admin/withdrawals", label: "Withdrawals", icon: DollarSign, allowedRoles: WITHDRAWAL_REVIEW_ROLES },
  { href: "/admin/refunds", label: "Refunds", icon: RotateCcw },
  { href: "/admin/wallet/settings", label: "Wallet Settings", icon: Settings2, superAdminOnly: true },
  { href: "/admin/wallet/approvers", label: "Wallet Approvers", icon: UserRoundCheck, superAdminOnly: true },
  { href: "/admin/reports/payouts", label: "Payout Reports", icon: FileBarChart2, superAdminOnly: true },
  { href: "/admin/recommendations", label: "Recommendations", icon: Gem, allowedRoles: CONTENT_REVIEW_ROLES },
  { href: "/admin/support", label: "Support Tickets", icon: Inbox },
  { href: "/admin/chat-reports", label: "Chat Reports", icon: Flag },
  { href: "/admin/affiliate", label: "Affiliate", icon: Link2 },
  { href: "/admin/chatbot", label: "Chatbot", icon: Bot },
  // CLAUDE-ADMIN-AI.md: "Gate on super_admin" — stricter than the rest of
  // this NAV (which admin/approver both see). Filtered in render below.
  { href: "/admin/ai-assistant", label: "AI Assistant", icon: Sparkles, superAdminOnly: true },
  // CLAUDE-SUPPORT-MUTE-REPORT.md Feature 4: moved out of the AI Assistant
  // page into its own nav entry — it's staff-conduct review, not an AI
  // capability, and was only ever co-located there because that page was
  // already super-admin-gated.
  { href: "/admin/staff-conduct", label: "Staff Conduct", icon: UserX, superAdminOnly: true },
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const { currentUser, loading } = useRequireRole(["admin", "approver", "super_admin"]);
  const { t: tAdmin } = useTranslation("admin");
  const { t: tCommon } = useTranslation("common");

  const pathname = usePathname();
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  // CLAUDE-FIXES-2.md item 1: a count on the Support Tickets nav item —
  // queue-wide, any ticket with an unread customer reply, not just mine.
  const [unreadTickets, setUnreadTickets] = useState(0);
  const [pendingCounts, setPendingCounts] = useState<PendingCounts>(EMPTY_PENDING_COUNTS);
  const [pendingCountsReady, setPendingCountsReady] = useState(false);
  const [unreadRecommendations, setUnreadRecommendations] = useState(0);

  async function signOut() {
    await supabase.auth.signOut();
    router.replace("/login");
    router.refresh();
  }

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

  useEffect(() => {
    if (!currentUser) return;
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
      void pollPendingCounts();
    }, UNREAD_POLL_MS);

    return () => {
      cancelled = true;
      clearInterval(interval);
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
      void pollRecommendationUnread();
    }, UNREAD_POLL_MS);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [currentUser?.role]);

  if (loading || !currentUser) {
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

  return (
    <div className="flex h-screen overflow-hidden">
      <aside className="flex h-screen w-60 shrink-0 flex-col bg-gray-900">
        <div className="flex h-16 items-center gap-2.5 border-b border-gray-700 px-5">
          <div className="w-8 h-8 rounded-xl flex items-center justify-center bg-gray-800">
            <Shield size={16} className="text-white" />
          </div>
          <div>
            <span className="font-bold text-white text-sm font-[family-name:var(--font-display)]">{BRAND_NAME}</span>
            <p className="text-[0.625rem] text-white/35">{tAdmin("shell.panel")}</p>
          </div>
        </div>
        <div className="px-4 py-3 border-b border-gray-700">
          <p className="text-[0.625rem] uppercase tracking-wider mb-1 text-white/35">{tAdmin("shell.signedInAs")}</p>
          <p className="text-sm font-bold text-white">{currentUser.name}</p>
          <div className="mt-1 inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[0.625rem] font-bold bg-gray-800 text-gray-300">
            <Shield size={9} /> {tAdmin(`roles.${currentUser.role}`)}
          </div>
        </div>
        <nav className="min-h-0 flex-1 overflow-y-auto px-3 py-4 space-y-0.5">
          {NAV.filter((item) =>
            (!item.superAdminOnly || currentUser.role === "super_admin")
            && (!item.allowedRoles || item.allowedRoles.includes(currentUser.role)),
          ).map((item) => {
            // item.href === "/admin/recommendations" uses its pending queue count for Super Admins.
            const count = item.href === "/admin/support" ? unreadTickets : pendingCountFor(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm font-medium transition-all ${pathname === item.href || pathname.startsWith(`${item.href}/`) ? "bg-gray-800 text-white" : "text-gray-400 hover:bg-gray-800 hover:text-white"}`}
              >
                <item.icon size={15} /> {tAdmin(`navigation.${item.label}`)}
                {count > 0 && (
                  <span className="ml-auto min-w-[18px] h-[18px] px-1 rounded-full text-[0.625rem] font-bold text-gray-900 flex items-center justify-center bg-gray-200" aria-label={tAdmin("accessibility.pendingItems", { count })}>
                    {count}
                  </span>
                )}
              </Link>
            );
          })}
        </nav>
      </aside>
      <div className="min-h-0 min-w-0 flex-1 overflow-x-hidden overflow-y-auto" style={{ backgroundColor: "var(--background)" }}>
        <header className="sticky top-0 z-40 flex h-16 items-center justify-end gap-2 bg-background/95 px-4 backdrop-blur-md sm:px-6">
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
        </header>
        {children}
      </div>
    </div>
  );
}
