import { requireAccessControlSuperAdmin } from "@/lib/entitlements/admin-guard";
import { apiOk } from "@/lib/validation/schemas";
import { loadAccessControlStateResponse, stringField } from "@/app/api/admin/access-control/_shared";

export const dynamic = "force-dynamic";

export async function GET() {
  const { response } = await requireAccessControlSuperAdmin();
  if (response) return response;

  const result = await loadAccessControlStateResponse();
  if (result.response || !result.state) return result.response!;
  const now = Date.now();
  const inThirtyDays = now + 30 * 24 * 60 * 60 * 1000;
  const activeAssignments = result.state.assignments.filter((row) => !stringField(row, "revoked_at", "revokedAt"));
  const expiringAssignments = activeAssignments.filter((row) => {
    const value = stringField(row, "expires_at", "expiresAt");
    if (!value) return false;
    const time = Date.parse(value);
    return Number.isFinite(time) && time > now && time <= inThirtyDays;
  });

  return apiOk({
    generation: result.state.generation,
    counts: {
      capabilities: result.state.capabilities.length,
      policies: result.state.policies.length,
      activeVersions: result.state.policyVersions.filter((row) => stringField(row, "status") === "active").length,
      pendingApprovals: result.state.policyVersions.filter((row) => stringField(row, "status") === "pending_approval").length,
      activeAssignments: activeAssignments.length,
      expiringAssignments: expiringAssignments.length,
    },
    warnings: result.state.capabilities.some((row) => row.enabled !== true)
      ? ["CAPABILITY_DISABLED"]
      : [],
  });
}
