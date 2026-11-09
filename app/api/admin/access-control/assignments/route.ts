import { listAccessControlAssignments, setEntitlementAssignment } from "@/lib/entitlements/admin";
import { getAdminUserLabel } from "@/lib/admin/identity";
import { requireAccessControlSuperAdmin } from "@/lib/entitlements/admin-guard";
import { apiOk, parseBody } from "@/lib/validation/schemas";
import {
  assignmentSchema,
  assignmentsFiltersSchema,
  parseSearchParams,
} from "@/lib/validation/entitlement-schemas";
import {
  accessControlFailure,
  mutationReceipt,
  stringField,
  validationFailure,
} from "@/app/api/admin/access-control/_shared";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { response } = await requireAccessControlSuperAdmin();
  if (response) return response;
  const parsed = parseSearchParams(request.url, assignmentsFiltersSchema);
  if (!parsed.success) return validationFailure();

  try {
    const result = await listAccessControlAssignments(parsed.data);
    return apiOk({
      ...result,
      items: result.items.map((item) => ({
        id: stringField(item, "id"),
        subjectType: stringField(item, "subject_type"),
        subjectId: stringField(item, "subject_id"),
        capabilityKey: stringField(item, "capability_key"),
        effect: stringField(item, "effect"),
        startsAt: stringField(item, "starts_at"),
        expiresAt: stringField(item, "expires_at"),
        reason: stringField(item, "reason"),
        grantedBy: stringField(item, "granted_by"),
        revokedBy: stringField(item, "revoked_by"),
        revokedAt: stringField(item, "revoked_at"),
        createdAt: stringField(item, "created_at"),
        status: stringField(item, "status"),
        subjectName: item.subject_type === "user" ? getAdminUserLabel({
          fullName: stringField(item, "subject_full_name"),
          displayName: stringField(item, "subject_display_name"),
          email: stringField(item, "subject_email"),
        }) : null,
        subjectEmail: item.subject_type === "user" ? stringField(item, "subject_email") : null,
      })),
    });
  } catch (error) {
    return accessControlFailure(error);
  }
}

export async function POST(request: Request) {
  const { db, user, response } = await requireAccessControlSuperAdmin();
  if (response) return response;
  if (!user) return validationFailure();
  const parsed = await parseBody(request, assignmentSchema);
  if (!parsed.ok) return parsed.response;

  try {
    const assignmentId = await setEntitlementAssignment(parsed.data);
    return mutationReceipt(
      db,
      user.id,
      "entitlement.assignment.set",
      assignmentId,
      { assignmentId },
      201,
    );
  } catch (error) {
    return accessControlFailure(error);
  }
}
