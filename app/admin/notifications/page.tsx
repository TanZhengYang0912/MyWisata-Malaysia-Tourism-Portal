"use client";

import { Bell } from "lucide-react";
import { useTranslation } from "react-i18next";
import { AdminPageHeader, AdminPageShell } from "@/components/admin/admin-page-shell";
import { NotificationCenter } from "@/components/shared/notification-center";

const STAFF_NOTIFICATION_CATEGORIES = [
  { value: "all", label: "All" },
  { value: "wallet", label: "Wallet" },
  { value: "support", label: "Support" },
  { value: "account_security", label: "Account & Security" },
  { value: "messages", label: "Messages" },
];

export default function AdminNotificationsPage() {
  const { t } = useTranslation("common");
  const categories = STAFF_NOTIFICATION_CATEGORIES.map((category) => ({
    ...category,
    label: t(`notifications.categories.${category.value}`),
  }));

  return (
    <AdminPageShell>
      <AdminPageHeader
        eyebrow={<><Bell size={14} /> {t("notifications.label")}</>}
        title={t("notifications.title")}
      />
      <NotificationCenter scope="staff" categories={categories} pageSize={15} />
    </AdminPageShell>
  );
}
