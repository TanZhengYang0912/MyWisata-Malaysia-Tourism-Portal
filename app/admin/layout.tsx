"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Activity, Gem, Inbox, LogOut, Package, Shield, DollarSign, Link2 } from "lucide-react";
import { useRequireRole } from "@/components/providers/auth";

const NAV = [
  { href: "/admin/dashboard", label: "Overview", icon: Activity },
  { href: "/admin/vendors", label: "Vendor Approvals", icon: Package },
  { href: "/admin/kyc", label: "KYC Review", icon: Shield },
  { href: "/admin/withdrawals", label: "Withdrawals", icon: DollarSign },
  { href: "/admin/recommendations", label: "Recommendations", icon: Gem },
  { href: "/admin/support", label: "Support Tickets", icon: Inbox },
  { href: "/admin/affiliate", label: "Affiliate", icon: Link2 },
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const { currentUser, loading } = useRequireRole(["admin", "approver", "super_admin"]);

  const pathname = usePathname();

  if (loading || !currentUser) {
    return <div className="min-h-screen flex items-center justify-center text-muted-foreground text-sm">Loading…</div>;
  }

  return (
    <div className="flex min-h-screen">
      <div className="flex flex-col w-60 shrink-0" style={{ backgroundColor: "#1A272F" }}>
        <div className="flex items-center gap-2.5 px-5 py-5 border-b border-white/10">
          <div className="w-8 h-8 rounded-xl flex items-center justify-center bg-destructive">
            <Shield size={16} className="text-white" />
          </div>
          <div>
            <span className="font-bold text-white text-sm font-[family-name:var(--font-display)]">MyWisata</span>
            <p className="text-[10px] text-white/35">Admin Panel</p>
          </div>
        </div>
        <div className="px-4 py-3 border-b border-white/10">
          <p className="text-[10px] uppercase tracking-wider mb-1 text-white/35">Signed in as</p>
          <p className="text-sm font-bold text-white">{currentUser.name}</p>
          <div className="mt-1 inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-destructive/25 text-destructive">
            <Shield size={9} /> {currentUser.role.replace("_", " ")}
          </div>
        </div>
        <nav className="flex-1 px-3 py-4 space-y-0.5">
          {NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="w-full flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm font-medium transition-all"
              style={{
                backgroundColor: pathname === item.href ? "var(--destructive)" : "transparent",
                color: pathname === item.href ? "white" : "rgba(255,255,255,0.45)",
              }}
            >
              <item.icon size={15} /> {item.label}
            </Link>
          ))}
        </nav>
        <div className="p-3 border-t border-white/10">
          <Link href="/login" className="w-full flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm text-white/35">
            <LogOut size={15} /> Switch account
          </Link>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto" style={{ backgroundColor: "var(--background)" }}>
        {children}
      </div>
    </div>
  );
}
