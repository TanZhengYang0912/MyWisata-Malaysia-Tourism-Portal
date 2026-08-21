"use client";

// P4 — Member 4: staff conduct review, its own nav page.
// CLAUDE-ADMIN-CONDUCT.md + CLAUDE-SUPPORT-MUTE-REPORT.md Feature 4.
// Previously mounted at the bottom of /admin/ai-assistant (only because that
// page was already super-admin-gated) — moved out to its own sidebar entry
// since it isn't an AI capability. Same client-side gate as ai-assistant's
// page component; StaffConductPanel's own API calls independently re-check
// server-side regardless.

import { Shield } from "lucide-react";
import { useAuth } from "@/components/providers/auth";
import { StaffConductPanel } from "@/components/admin/staff-conduct-panel";
import { AdminPageHeader, AdminPageShell } from "@/components/admin/admin-page-shell";
import { useTranslation } from "react-i18next";

export default function AdminStaffConductPage() {
  const { currentUser } = useAuth();
  const { t } = useTranslation("admin");

  if (currentUser && currentUser.role !== "super_admin") {
    return (
      <AdminPageShell>
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Shield size={16} /> {t("strictMigration.staffConduct.restricted")}
        </div>
      </AdminPageShell>
    );
  }

  return (
    <AdminPageShell>
      <AdminPageHeader
        eyebrow={<span className="flex items-center gap-2"><Shield size={14} /> {t("strictMigration.staffConduct.eyebrow")}</span>}
        title={t("strictMigration.staffConduct.title")}
        description={t("strictMigration.staffConduct.description")}
      />
      <StaffConductPanel />
    </AdminPageShell>
  );
}
