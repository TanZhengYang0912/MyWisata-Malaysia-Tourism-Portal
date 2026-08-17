"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Activity, ClipboardCheck, Flag, Gem, Inbox, LogOut, Package, Shield, DollarSign, Link2, Bot, Sparkles, UsersRound, Settings2, FileBarChart2 } from "lucide-react";
import { useRequireRole } from "@/components/providers/auth";
import { createClient } from "@/lib/supabase/client";
import { useTranslation } from "react-i18next";
import { LanguageSwitcher } from "@/components/shared/language-switcher";

const UNREAD_POLL_MS = 30_000;

const NAV = [
  { href: "/admin/dashboard", label: "Overview", icon: Activity },
  { href: "/admin/vendors", label: "Vendor Approvals", icon: Package },
  { href: "/admin/catalogue", label: "Catalogue Review", icon: ClipboardCheck },
  { href: "/admin/users", label: "User Management", icon: UsersRound, superAdminOnly: true },
  { href: "/admin/kyc", label: "KYC Review", icon: Shield },
  { href: "/admin/withdrawals", label: "Withdrawals", icon: DollarSign },
  { href: "/admin/wallet/settings", label: "Wallet Settings", icon: Settings2, superAdminOnly: true },
  { href: "/admin/reports/payouts", label: "Payout Reports", icon: FileBarChart2, superAdminOnly: true },
  { href: "/admin/recommendations", label: "Recommendations", icon: Gem },
  { href: "/admin/support", label: "Support Tickets", icon: Inbox },
  { href: "/admin/chat-reports", label: "Chat Reports", icon: Flag },
  { href: "/admin/affiliate", label: "Affiliate", icon: Link2 },
  { href: "/admin/chatbot", label: "Chatbot", icon: Bot },
  // CLAUDE-ADMIN-AI.md: "Gate on super_admin" — stricter than the rest of
  // this NAV (which admin/approver both see). Filtered in render below.
  { href: "/admin/ai-assistant", label: "AI Assistant", icon: Sparkles, superAdminOnly: true },
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
    return <div className="min-h-screen flex items-center justify-center text-muted-foreground text-sm">{tCommon("states.loadingEllipsis", { defaultValue: "Loading…" })}</div>;
  }

  return (
    <div className="flex h-screen overflow-hidden">
      <aside className="flex h-screen w-60 shrink-0 flex-col bg-gray-900">
        <div className="flex items-center gap-2.5 px-5 py-5 border-b border-white/10">
          <div className="w-8 h-8 rounded-xl flex items-center justify-center bg-gray-800">
            <Shield size={16} className="text-white" />
          </div>
          <div>
            <span className="font-bold text-white text-sm font-[family-name:var(--font-display)]">MyWisata</span>
            <p className="text-[10px] text-white/35">{tAdmin("shell.panel", { defaultValue: "Admin Panel" })}</p>
          </div>
        </div>
        <div className="px-4 py-3 border-b border-white/10">
          <p className="text-[10px] uppercase tracking-wider mb-1 text-white/35">{tAdmin("shell.signedInAs", { defaultValue: "Signed in as" })}</p>
          <p className="text-sm font-bold text-white">{currentUser.name}</p>
          <div className="mt-1 inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-gray-800 text-gray-300">
            <Shield size={9} /> {tAdmin(`roles.${currentUser.role}`, { defaultValue: currentUser.role.replace("_", " ") })}
          </div>
        </div>
        <nav className="min-h-0 flex-1 overflow-y-auto px-3 py-4 space-y-0.5">
          {NAV.filter((item) => !item.superAdminOnly || currentUser.role === "super_admin").map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm font-medium transition-all ${pathname === item.href || pathname.startsWith(`${item.href}/`) ? "bg-gray-800 text-white" : "text-gray-400 hover:bg-gray-800 hover:text-white"}`}
            >
              <item.icon size={15} /> {tAdmin(`navigation.${item.label}`, { defaultValue: item.label })}
              {item.href === "/admin/support" && unreadTickets > 0 && (
                  <span className="ml-auto min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-bold text-gray-900 flex items-center justify-center bg-gray-200">
                  {unreadTickets}
                </span>
              )}
              {item.href === "/admin/recommendations" && currentUser.role === "super_admin" && unreadRecommendations > 0 && (
                <span className="ml-auto min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-bold text-gray-900 flex items-center justify-center bg-gray-200" aria-label={`${unreadRecommendations} unread recommendations`}>
                  {unreadRecommendations}
                </span>
              )}
            </Link>
          ))}
        </nav>
        <div className="shrink-0 border-t border-white/10 p-3">
          <LanguageSwitcher compact className="mb-2" />
          <button type="button" onClick={() => void signOut()} className="flex w-full items-center gap-3 rounded-xl px-4 py-2.5 text-left text-sm text-white/55 transition-colors hover:bg-gray-800 hover:text-white">
            <LogOut size={15} /> {tCommon("actions.signOut", { defaultValue: "Sign out" })}
          </button>
        </div>
      </aside>
      <div className="min-h-0 min-w-0 flex-1 overflow-x-hidden overflow-y-auto" style={{ backgroundColor: "var(--background)" }}>
        {children}
      </div>
    </div>
  );
}
