"use client";

import { ShieldCog } from "lucide-react";
import { useTranslation } from "react-i18next";

import { AccessControlTabs } from "@/components/admin/access-control/access-control-tabs";
import { AdminPageHeader, AdminPageShell } from "@/components/admin/admin-page-shell";
import { useRequireRole } from "@/components/providers/auth";

export default function AccessControlPage() {
  const { t } = useTranslation("admin");
  const { currentUser, loading } = useRequireRole(["super_admin"]);

  if (loading || currentUser?.role !== "super_admin") {
    return <AdminPageShell><p className="text-sm text-muted-foreground">{t("accessControl.states.loading")}</p></AdminPageShell>;
  }

  return (
    <AdminPageShell>
      <AdminPageHeader
        eyebrow={<span className="flex items-center gap-2"><ShieldCog size={14} /> {t("accessControl.eyebrow")}</span>}
        title={t("accessControl.title")}
        description={t("accessControl.description")}
      />
      <AccessControlTabs />
    </AdminPageShell>
  );
}
