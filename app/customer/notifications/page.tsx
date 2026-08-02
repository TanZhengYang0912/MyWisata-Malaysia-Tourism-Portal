"use client";

import { NotificationCenter } from "@/components/shared/notification-center";
import { CustomerPageHeader, CustomerPageShell } from "@/components/customer/customer-page-shell";

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
    <CustomerPageShell>
      <CustomerPageHeader
        eyebrow="Account"
        title="Notifications"
        description="Updates about your bookings, wallet and account."
      />
      <NotificationCenter scope="customer" categories={filters} pageSize={15} />
    </CustomerPageShell>
  );
}
