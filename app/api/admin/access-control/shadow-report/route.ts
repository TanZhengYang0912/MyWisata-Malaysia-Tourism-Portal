import { requireAccessControlSuperAdmin } from "@/lib/entitlements/admin-guard";
import { isCapabilityKey, type CapabilityKey } from "@/lib/entitlements/types";
import type { ShadowClassification, ShadowEvaluationTelemetry } from "@/lib/entitlements/shadow-evaluation";
import { apiFail, apiOk } from "@/lib/validation/schemas";

export const dynamic = "force-dynamic";

const CLASSIFICATIONS = new Set<ShadowClassification>([
  "parity",
  "expected_change",
  "blocking_denial",
  "blocking_overgrant",
]);
const ALLOWED_PARAMS = new Set(["page", "pageSize", "classification", "capability", "blocking"]);

type Filters = {
  page: number;
  pageSize: number;
  classification: ShadowClassification | null;
  capability: CapabilityKey | null;
  blocking: boolean | null;
};

function parseInteger(value: string | null, fallback: number, maximum: number) {
  if (value === null) return fallback;
  if (!/^[1-9][0-9]*$/.test(value)) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed <= maximum ? parsed : null;
}

function parseFilters(request: Request): Filters | null {
  const search = new URL(request.url).searchParams;
  if ([...search.keys()].some((key) => !ALLOWED_PARAMS.has(key))) return null;
  const page = parseInteger(search.get("page"), 1, 1_000_000);
  const pageSize = parseInteger(search.get("pageSize"), 25, 100);
  const classificationValue = search.get("classification");
  const capabilityValue = search.get("capability");
  const blockingValue = search.get("blocking");
  if (page === null
      || pageSize === null
      || (classificationValue !== null && !CLASSIFICATIONS.has(classificationValue as ShadowClassification))
      || (capabilityValue !== null && !isCapabilityKey(capabilityValue))
      || (blockingValue !== null && blockingValue !== "true" && blockingValue !== "false")) {
    return null;
  }
  return {
    page,
    pageSize,
    classification: classificationValue as ShadowClassification | null,
    capability: capabilityValue as CapabilityKey | null,
    blocking: blockingValue === null ? null : blockingValue === "true",
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseTelemetry(value: unknown): ShadowEvaluationTelemetry | null {
  if (!isRecord(value)
      || typeof value.userHash !== "string"
      || !/^[a-f0-9]{64}$/.test(value.userHash)
      || typeof value.capability !== "string"
      || !isCapabilityKey(value.capability)
      || typeof value.legacyAllowed !== "boolean"
      || typeof value.entitlementAllowed !== "boolean"
      || typeof value.classification !== "string"
      || !CLASSIFICATIONS.has(value.classification as ShadowClassification)
      || typeof value.blocking !== "boolean"
      || !Number.isSafeInteger(value.entitlementGeneration)
      || (value.entitlementGeneration as number) < 0) {
    return null;
  }
  const classification = value.classification as ShadowClassification;
  const expectedBlocking = classification === "blocking_denial" || classification === "blocking_overgrant";
  if (value.blocking !== expectedBlocking) return null;
  return {
    userHash: value.userHash,
    capability: value.capability,
    legacyAllowed: value.legacyAllowed,
    entitlementAllowed: value.entitlementAllowed,
    classification,
    blocking: value.blocking,
    entitlementGeneration: value.entitlementGeneration as number,
  };
}

export async function GET(request: Request) {
  const { db, response } = await requireAccessControlSuperAdmin();
  if (response) return response;
  const filters = parseFilters(request);
  if (!filters) return apiFail("VALIDATION_FAILED", "Request failed validation", 422);
  const offset = (filters.page - 1) * filters.pageSize;

  let query = db.from("audit_logs")
    .select("id,actor_id,after_data,created_at", { count: "exact" })
    .eq("action", "entitlement.shadow_evaluation")
    .is("actor_id", null);
  if (filters.classification) query = query.eq("after_data->>classification", filters.classification);
  if (filters.capability) query = query.eq("after_data->>capability", filters.capability);
  if (filters.blocking !== null) query = query.eq("after_data->>blocking", String(filters.blocking));

  const { data, error, count } = await query
    .order("created_at", { ascending: false })
    .range(offset, offset + filters.pageSize - 1);
  if (error) return apiFail("SHADOW_REPORT_UNAVAILABLE", "Unable to load the shadow report", 500);

  const items = (data ?? []).flatMap((row) => {
    const telemetry = parseTelemetry(row.after_data);
    if (row.actor_id !== null
        || !telemetry
        || typeof row.id !== "string"
        || typeof row.created_at !== "string") return [];
    return [{ id: row.id, ...telemetry, createdAt: row.created_at }];
  });
  const total = count ?? items.length;

  return apiOk({
    items,
    page: filters.page,
    pageSize: filters.pageSize,
    total,
    totalPages: Math.ceil(total / filters.pageSize),
  });
}
