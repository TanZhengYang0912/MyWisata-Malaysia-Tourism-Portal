"use client";

import { useTranslation } from "react-i18next";
import { NotificationCenter } from "@/components/shared/notification-center";
import { CustomerPageHeader, CustomerPageShell } from "@/components/customer/customer-page-shell";
import { GuestAccountEmptyState } from "@/components/customer/guest-account-empty-state";
import { useAuth } from "@/components/providers/auth";

const filters = [
  { value: "all", label: "All" },
  { value: "wallet", label: "Wallet" },
  { value: "bookings_purchases", label: "Bookings & Purchases" },
  { value: "recommendations_affiliate", label: "Recommendations & Affiliate" },
  { value: "support", label: "Support" },
  { value: "account_security", label: "Account & Security" },
];

export default function NotificationsPage() {
  const { t: tCustomer } = useTranslation("customer");
  const { currentUser } = useAuth();
  return (
    <CustomerPageShell>
      <CustomerPageHeader
        eyebrow={tCustomer("accountGroups.account")}
        title={tCustomer("notifications.title", { ns: "common" })}
        description="Updates about your bookings, wallet and account."
      />
      {currentUser ? (
        <NotificationCenter enabled={Boolean(currentUser)} scope="customer" categories={filters} pageSize={15} />
      ) : (
        <GuestAccountEmptyState title={tCustomer("notifications.noNotificationsYet", { ns: "common" })} description={tCustomer("ui.guest.accountHint")} nextPath="/customer/notifications" value="0 unread" />
      )}
    </CustomerPageShell>
  );
}
