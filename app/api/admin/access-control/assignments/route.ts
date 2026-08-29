import { setEntitlementAssignment } from "@/lib/entitlements/admin";
import { requireAccessControlSuperAdmin } from "@/lib/entitlements/admin-guard";
import { apiOk, parseBody } from "@/lib/validation/schemas";
import {
  assignmentSchema,
  assignmentsFiltersSchema,
  parseSearchParams,
} from "@/lib/validation/entitlement-schemas";
import {
  accessControlFailure,
  loadAccessControlStateResponse,
  mutationReceipt,
  paginate,
  stringField,
  validationFailure,
} from "@/app/api/admin/access-control/_shared";

export const dynamic = "force-dynamic";

function assignmentStatus(row: Record<string, unknown>, now: number) {
  if (stringField(row, "revoked_at", "revokedAt")) return "revoked";
  const startsAt = stringField(row, "starts_at", "startsAt");
  const expiresAt = stringField(row, "expires_at", "expiresAt");
  if (startsAt && Date.parse(startsAt) > now) return "scheduled";
  if (expiresAt && Date.parse(expiresAt) <= now) return "expired";
  return "active";
}

export async function GET(request: Request) {
  const { response } = await requireAccessControlSuperAdmin();
  if (response) return response;
  const parsed = parseSearchParams(request.url, assignmentsFiltersSchema);
  if (!parsed.success) return validationFailure();

  const result = await loadAccessControlStateResponse();
  if (result.response || !result.state) return result.response!;
  const filters = parsed.data;
  const search = filters.search?.toLowerCase();
  const now = Date.now();
  const items = result.state.assignments.map((row) => ({
    id: stringField(row, "id"),
    subjectType: stringField(row, "subject_type", "subjectType"),
    subjectId: stringField(row, "subject_id", "subjectId"),
    capabilityKey: stringField(row, "capability_key", "capabilityKey"),
    effect: stringField(row, "effect"),
    startsAt: stringField(row, "starts_at", "startsAt"),
    expiresAt: stringField(row, "expires_at", "expiresAt"),
    reason: stringField(row, "reason"),
    grantedBy: stringField(row, "granted_by", "grantedBy"),
    revokedBy: stringField(row, "revoked_by", "revokedBy"),
    revokedAt: stringField(row, "revoked_at", "revokedAt"),
    createdAt: stringField(row, "created_at", "createdAt"),
    status: assignmentStatus(row, now),
  })).filter((item) => (!search || item.subjectId?.toLowerCase().includes(search) || item.capabilityKey?.toLowerCase().includes(search))
    && (!filters.subjectType || item.subjectType === filters.subjectType)
    && (!filters.capabilityKey || item.capabilityKey === filters.capabilityKey)
    && (!filters.effect || item.effect === filters.effect)
    && (!filters.status || item.status === filters.status));

  return apiOk({ ...paginate(items, filters.page, filters.pageSize), generation: result.state.generation });
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
