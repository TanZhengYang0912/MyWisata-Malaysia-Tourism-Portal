"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BarChart2, Calendar, Globe, Inbox, LogOut, Package, Tag } from "lucide-react";
import { useRequireRole } from "@/lib/auth";
import { getOutlets } from "@/lib/db/repos/catalogue";

const NAV = [
  { href: "/vendor/dashboard", label: "Dashboard", icon: BarChart2 },
  { href: "/vendor/listings", label: "Listings", icon: Package },
  { href: "/vendor/bookings", label: "Bookings", icon: Calendar },
  { href: "/vendor/vouchers", label: "Vouchers", icon: Tag },
  { href: "/vendor/inbox", label: "Chat Inbox", icon: Inbox },
];

export function scopedOutletIds(activeVendorId?: string, activeOutletIds?: string[]): string[] {
  if (activeOutletIds?.length) return activeOutletIds;
  if (activeVendorId) return getOutlets().filter((o) => o.vendorId === activeVendorId).map((o) => o.id);
  return [];
}

export default function VendorLayout({ children }: { children: React.ReactNode }) {
  const { currentUser, loading, activeVendorId, activeOutletIds } = useRequireRole(["vendor_owner", "outlet_manager"]);
  const pathname = usePathname();

  if (loading || !currentUser) {
    return <div className="min-h-screen flex items-center justify-center text-muted-foreground text-sm">Loading…</div>;
  }

  const outlets = getOutlets().filter((o) => scopedOutletIds(activeVendorId, activeOutletIds).includes(o.id));

  return (
    <div className="flex min-h-screen">
      <div className="flex flex-col w-60 shrink-0 bg-sidebar text-sidebar-foreground">
        <div className="flex items-center gap-2.5 px-5 py-5 border-b border-white/10">
          <div className="w-8 h-8 rounded-xl flex items-center justify-center bg-primary">
            <Globe size={16} className="text-white" />
          </div>
          <span className="font-bold font-[family-name:var(--font-display)]">MyWisata</span>
        </div>
        <div className="px-4 py-3 border-b border-white/10">
          <p className="text-[10px] uppercase tracking-wider mb-1 text-white/40">Signed in as</p>
          <p className="text-sm font-bold">{currentUser.name}</p>
          <p className="text-xs text-white/50 mt-0.5">{outlets.map((o) => o.name).join(", ") || "No outlets assigned"}</p>
        </div>
        <nav className="flex-1 px-3 py-4 space-y-0.5">
          {NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all"
              style={{
                backgroundColor: pathname === item.href ? "var(--primary)" : "transparent",
                color: pathname === item.href ? "white" : "rgba(255,255,255,0.55)",
              }}
            >
              <item.icon size={16} /> {item.label}
            </Link>
          ))}
        </nav>
        <div className="p-3 border-t border-white/10">
          <Link href="/login" className="w-full flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm text-white/40">
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
