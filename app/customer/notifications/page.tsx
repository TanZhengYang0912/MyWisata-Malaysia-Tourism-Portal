"use client";

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
  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
      <div className="mb-6">
        <p className="text-xs font-bold uppercase tracking-[0.16em] text-primary">Account</p>
        <h1 className="mt-2 text-2xl font-bold text-foreground sm:text-3xl">Notifications</h1>
        <p className="mt-1 text-sm text-muted-foreground">Updates about your bookings, wallet and account.</p>
      </div>
      <NotificationCenter scope="customer" categories={filters} pageSize={15} />
    </div>
  );
}
