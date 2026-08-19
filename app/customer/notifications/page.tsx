"use client";

import { useTranslation } from "react-i18next";
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
  const { t: tCustomer } = useTranslation("customer");
  const { t: tCommon } = useTranslation("common");
  const translatedFilters = filters.map((filter) => ({ ...filter, label: tCommon(`notifications.categories.${filter.value}`, { defaultValue: filter.label }) }));
  return (
    <CustomerPageShell>
      <CustomerPageHeader
        eyebrow={tCustomer("accountGroups.account", { defaultValue: "Account" })}
        title={tCommon("notifications.title", { defaultValue: "Notifications" })}
        description={tCustomer("ui.notifications.description", { defaultValue: "Updates about your bookings, wallet and account." })}
      />
      <NotificationCenter scope="customer" categories={translatedFilters} pageSize={15} />
    </CustomerPageShell>
  );
}
