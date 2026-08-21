"use client";

import { useTranslation } from "react-i18next";
import { NotificationCenter } from "@/components/shared/notification-center";
import { CustomerPageShell, CustomerPageTitle } from "@/components/customer/customer-page-shell";

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
  const translatedFilters = filters.map((filter) => ({ ...filter, label: tCommon(`notifications.categories.${filter.value}`) }));
  return (
    <>
      <CustomerPageTitle
        eyebrow={tCustomer("accountGroups.account")}
        title={tCommon("notifications.title")}
        description={tCustomer("ui.notifications.description")}
      />
      <CustomerPageShell wide className="pt-0 sm:pt-0">
        <NotificationCenter scope="customer" categories={translatedFilters} pageSize={15} />
      </CustomerPageShell>
    </>
  );
}
