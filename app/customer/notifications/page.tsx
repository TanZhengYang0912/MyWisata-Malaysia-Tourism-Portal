"use client";

import { NotificationBell } from "@/components/shared/notification-bell";
import { NotificationCenter } from "@/components/shared/notification-center";

const filters = [
  { value: "all", label: "All" },
  { value: "wallet", label: "Wallet" },
  { value: "bookings_purchases", label: "Bookings & Purchases" },
  { value: "recommendations_affiliate", label: "Recommendations & Affiliate" },
  { value: "support", label: "Support" },
  { value: "account_security", label: "Account & Security" },
];

export default function NotificationsPage() {
  return <div className="mx-auto max-w-3xl px-4 py-8"><div className="mb-5 flex items-center justify-between"><div><p className="text-xs uppercase tracking-wider text-muted-foreground">Account</p><h1 className="text-2xl font-bold">Notifications</h1></div><NotificationBell /></div><NotificationCenter scope="customer" categories={filters} pageSize={15} /></div>;
}
