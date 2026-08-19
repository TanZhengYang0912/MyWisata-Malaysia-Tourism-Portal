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

export default function AdminStaffConductPage() {
  const { currentUser } = useAuth();

  if (currentUser && currentUser.role !== "super_admin") {
    return (
      <div className="min-h-full bg-background px-4 py-6 sm:px-6 sm:py-8 xl:px-8">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Shield size={16} /> Staff conduct review is limited to super admins.
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-full bg-background px-4 py-6 sm:px-6 sm:py-8 xl:px-8 space-y-6">
      <div>
        <h1 className="font-[family-name:var(--font-display)] text-3xl font-bold tracking-[-0.04em] text-foreground sm:text-4xl">Staff Conduct</h1>
        <p className="text-sm text-muted-foreground">
          Flagged admin conduct and human-submitted chat reports, for super-admin review.
        </p>
      </div>
      <StaffConductPanel />
    </div>
  );
}
