import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireSuperAdmin: vi.fn(),
  listState: vi.fn(),
  createVersion: vi.fn(),
  approveVersion: vi.fn(),
  activateVersion: vi.fn(),
  rollbackPolicy: vi.fn(),
  setAssignment: vi.fn(),
  revokeAssignment: vi.fn(),
}));

vi.mock("@/lib/entitlements/admin-guard", () => ({
  requireAccessControlSuperAdmin: mocks.requireSuperAdmin,
}));

vi.mock("@/lib/entitlements/admin", () => ({
  listAccessControlState: mocks.listState,
  createPolicyVersion: mocks.createVersion,
  approvePolicyVersion: mocks.approveVersion,
  activatePolicyVersion: mocks.activateVersion,
  rollbackEntitlementPolicy: mocks.rollbackPolicy,
  setEntitlementAssignment: mocks.setAssignment,
  revokeEntitlementAssignment: mocks.revokeAssignment,
}));

import * as overviewRoute from "@/app/api/admin/access-control/overview/route";
import * as capabilitiesRoute from "@/app/api/admin/access-control/capabilities/route";
import * as policiesRoute from "@/app/api/admin/access-control/policies/route";
import * as versionsRoute from "@/app/api/admin/access-control/policies/[policyId]/versions/route";
import * as approveRoute from "@/app/api/admin/access-control/policies/versions/[versionId]/approve/route";
import * as activateRoute from "@/app/api/admin/access-control/policies/versions/[versionId]/activate/route";
import * as rollbackRoute from "@/app/api/admin/access-control/policies/[policyId]/rollback/route";
import * as assignmentsRoute from "@/app/api/admin/access-control/assignments/route";
import * as revokeRoute from "@/app/api/admin/access-control/assignments/[assignmentId]/revoke/route";
import * as auditRoute from "@/app/api/admin/access-control/audit-log/route";
import {
  auditLogFiltersSchema,
  capabilityMetadataSchema,
  createPolicyVersionSchema,
} from "@/lib/validation/entitlement-schemas";

const POLICY_ID = "11111111-1111-4111-8111-111111111111";
const VERSION_ID = "22222222-2222-4222-8222-222222222222";
const ASSIGNMENT_ID = "33333333-3333-4333-8333-333333333333";
const ACTOR_ID = "44444444-4444-4444-8444-444444444444";
const AUDIT_ID = "55555555-5555-4555-8555-555555555555";

const state = {
  capabilities: [{
    key: "commerce.checkout",
    category: "commerce",
    risk_level: "high",
    customer_visible: true,
    manually_assignable: false,
    enabled: true,
  }],
  policies: [{
    id: POLICY_ID,
    key: "commerce.checkout.phone",
    capability_key: "commerce.checkout",
    name: "Phone checkout",
    scope: "customer",
  }],
  policyVersions: [{
    id: VERSION_ID,
    policy_id: POLICY_ID,
    status: "pending_approval",
    version: 1,
    created_by: "creator-id",
  }],
  policyRequirements: [{
    policy_version_id: VERSION_ID,
    alternative_group: 1,
    fact_key: "phone_verified",
    operator: "eq",
    expected_value: true,
  }],
  approvals: [],
  assignments: [{
    id: ASSIGNMENT_ID,
    subject_type: "role",
    subject_id: "customer",
    capability_key: "commerce.checkout",
    effect: "deny",
    starts_at: "2026-08-30T00:00:00.000Z",
    expires_at: null,
    revoked_at: null,
  }],
  generation: 19,
};

function jsonError(code: string, status: number) {
  return Response.json({ data: null, error: { code, message: code } }, { status });
}

function queryBuilder(rows: unknown[] = []) {
  const result = { data: rows, error: null, count: rows.length };
  const builder: Record<string, unknown> = {};
  for (const method of ["select", "eq", "gte", "lte", "lt", "like", "ilike", "or", "contains", "order", "range", "limit"]) {
    builder[method] = vi.fn(() => builder);
  }
  builder.maybeSingle = vi.fn(async () => ({ data: rows[0] ?? null, error: null }));
  builder.then = (resolve: (value: typeof result) => unknown) => Promise.resolve(result).then(resolve);
  return builder;
}

function superAdminDb() {
  return {
    from: vi.fn((table: string) => table === "audit_logs"
      ? queryBuilder([{ id: AUDIT_ID, actor_id: ACTOR_ID, action: "entitlement.policy_version.created", entity_type: "entitlement_policy_version", entity_id: VERSION_ID, before_data: null, after_data: { generation: 19 }, note: "A valid reason", created_at: "2026-08-30T00:00:00.000Z" }])
      : queryBuilder()),
  };
}

function allowSuperAdmin() {
  mocks.requireSuperAdmin.mockResolvedValue({
    db: superAdminDb(),
    user: { id: ACTOR_ID },
    response: null,
  });
}

const validVersionBody = {
  effect: "allow",
  effectiveFrom: "2026-08-30T00:00:00.000Z",
  effectiveUntil: null,
  requirements: [{
    alternativeGroup: 1,
    factKey: "phone_verified",
    operator: "eq",
    expectedValue: true,
  }],
  reason: "Enable the verified phone checkout path",
};

type RouteCase = {
  name: string;
  call: () => Promise<Response>;
};

const routeCases: RouteCase[] = [
  { name: "overview GET", call: () => overviewRoute.GET() },
  { name: "capabilities GET", call: () => capabilitiesRoute.GET(new Request("http://localhost/api/admin/access-control/capabilities")) },
  { name: "policies GET", call: () => policiesRoute.GET(new Request("http://localhost/api/admin/access-control/policies")) },
  { name: "policy versions GET", call: () => versionsRoute.GET(new Request("http://localhost"), { params: Promise.resolve({ policyId: POLICY_ID }) }) },
  { name: "policy versions POST", call: () => versionsRoute.POST(new Request("http://localhost", { method: "POST", body: JSON.stringify(validVersionBody) }), { params: Promise.resolve({ policyId: POLICY_ID }) }) },
  { name: "policy approval POST", call: () => approveRoute.POST(new Request("http://localhost", { method: "POST", body: JSON.stringify({ reason: "Approved after independent review" }) }), { params: Promise.resolve({ versionId: VERSION_ID }) }) },
  { name: "policy activation POST", call: () => activateRoute.POST(new Request("http://localhost", { method: "POST", body: JSON.stringify({ reason: "Activate the independently approved policy" }) }), { params: Promise.resolve({ versionId: VERSION_ID }) }) },
  { name: "policy rollback POST", call: () => rollbackRoute.POST(new Request("http://localhost", { method: "POST", body: JSON.stringify({ targetVersion: 1, reason: "Restore the previously approved policy version" }) }), { params: Promise.resolve({ policyId: POLICY_ID }) }) },
  { name: "assignments GET", call: () => assignmentsRoute.GET(new Request("http://localhost/api/admin/access-control/assignments")) },
  { name: "assignments POST", call: () => assignmentsRoute.POST(new Request("http://localhost", { method: "POST", body: JSON.stringify({ subjectType: "role", subjectId: "customer", capabilityKey: "commerce.checkout", effect: "deny", startsAt: "2026-08-30T00:00:00.000Z", expiresAt: null, reason: "Temporarily deny checkout for this role" }) })) },
  { name: "assignment revoke POST", call: () => revokeRoute.POST(new Request("http://localhost", { method: "POST", body: JSON.stringify({ reason: "Remove the temporary assignment restriction" }) }), { params: Promise.resolve({ assignmentId: ASSIGNMENT_ID }) }) },
  { name: "audit log GET", call: () => auditRoute.GET(new Request("http://localhost/api/admin/access-control/audit-log")) },
];

describe("Access Control route authorization", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.listState.mockResolvedValue(state);
    mocks.createVersion.mockResolvedValue(VERSION_ID);
    mocks.approveVersion.mockResolvedValue(undefined);
    mocks.activateVersion.mockResolvedValue(undefined);
    mocks.rollbackPolicy.mockResolvedValue(VERSION_ID);
    mocks.setAssignment.mockResolvedValue(ASSIGNMENT_ID);
    mocks.revokeAssignment.mockResolvedValue(undefined);
  });

  for (const route of routeCases) {
    it.each([
      ["customer", "FORBIDDEN", 403],
      ["approver", "FORBIDDEN", 403],
      ["admin", "FORBIDDEN", 403],
    ])(`denies %s on ${route.name}`, async (_role, code, status) => {
      mocks.requireSuperAdmin.mockResolvedValue({ db: {}, user: { id: ACTOR_ID }, response: jsonError(code as string, status as number) });
      const response = await route.call();
      expect(response.status).toBe(status);
      expect((await response.json()).error.code).toBe(code);
    });

    it(`denies unauthenticated callers on ${route.name}`, async () => {
      mocks.requireSuperAdmin.mockResolvedValue({ db: {}, user: null, response: jsonError("UNAUTHORIZED", 401) });
      const response = await route.call();
      expect(response.status).toBe(401);
      expect((await response.json()).error.code).toBe("UNAUTHORIZED");
    });

    it(`allows a Super Admin on ${route.name}`, async () => {
      allowSuperAdmin();
      const response = await route.call();
      expect(response.status).toBeLessThan(400);
    });
  }
});

describe("Access Control validation and governed mutations", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    allowSuperAdmin();
    mocks.listState.mockResolvedValue(state);
    mocks.createVersion.mockResolvedValue(VERSION_ID);
    mocks.approveVersion.mockResolvedValue(undefined);
    mocks.activateVersion.mockResolvedValue(undefined);
    mocks.rollbackPolicy.mockResolvedValue(VERSION_ID);
    mocks.setAssignment.mockResolvedValue(ASSIGNMENT_ID);
    mocks.revokeAssignment.mockResolvedValue(undefined);
  });

  it("rejects unknown facts and operators before the policy RPC", async () => {
    const unknownFact = createPolicyVersionSchema.safeParse({
      ...validVersionBody,
      requirements: [{ alternativeGroup: 1, factKey: "browser_trusted_tier", operator: "eq", expectedValue: "kyc" }],
    });
    const unknownOperator = createPolicyVersionSchema.safeParse({
      ...validVersionBody,
      requirements: [{ alternativeGroup: 1, factKey: "phone_verified", operator: "eval", expectedValue: true }],
    });
    expect(unknownFact.success).toBe(false);
    expect(unknownOperator.success).toBe(false);

    const response = await versionsRoute.POST(new Request("http://localhost", {
      method: "POST",
      body: JSON.stringify({ ...validVersionBody, requirements: [{ alternativeGroup: 1, factKey: "phone_verified", operator: "eval", expectedValue: true }] }),
    }), { params: Promise.resolve({ policyId: POLICY_ID }) });
    expect(response.status).toBe(422);
    expect(mocks.createVersion).not.toHaveBeenCalled();
  });

  it("rejects browser-supplied actor IDs", async () => {
    const response = await versionsRoute.POST(new Request("http://localhost", {
      method: "POST",
      body: JSON.stringify({ ...validVersionBody, actorId: ACTOR_ID }),
    }), { params: Promise.resolve({ policyId: POLICY_ID }) });
    expect(response.status).toBe(422);
    expect(mocks.createVersion).not.toHaveBeenCalled();
  });

  it("maps governed self-approval denial to a stable forbidden code", async () => {
    mocks.approveVersion.mockRejectedValue(new Error("self_approval_forbidden"));
    const response = await approveRoute.POST(new Request("http://localhost", {
      method: "POST",
      body: JSON.stringify({ reason: "Approve this high-risk policy version" }),
    }), { params: Promise.resolve({ versionId: VERSION_ID }) });
    expect(response.status).toBe(403);
    expect((await response.json()).error.code).toBe("SELF_APPROVAL_FORBIDDEN");
  });

  it("returns the audit event and current generation after a mutation", async () => {
    const response = await versionsRoute.POST(new Request("http://localhost", {
      method: "POST",
      body: JSON.stringify(validVersionBody),
    }), { params: Promise.resolve({ policyId: POLICY_ID }) });
    expect(response.status).toBe(201);
    expect(await response.json()).toMatchObject({
      data: { policyVersionId: VERSION_ID, auditEventId: AUDIT_ID, generation: 19 },
      error: null,
    });
    expect(mocks.createVersion).toHaveBeenCalledWith({ policyId: POLICY_ID, ...validVersionBody });
  });

  it("rejects unknown Audit Log filters", () => {
    expect(auditLogFiltersSchema.safeParse({ page: "1", pageSize: "25", email: "secret@example.com" }).success).toBe(false);
  });

  it("rejects unknown capability metadata fields", () => {
    expect(capabilityMetadataSchema.safeParse({
      key: "commerce.checkout",
      category: "commerce",
      riskLevel: "high",
      customerVisible: true,
      manuallyAssignable: false,
      enabled: true,
      actorId: ACTOR_ID,
    }).success).toBe(false);
  });

  it("requires governed approval before activation", async () => {
    mocks.activateVersion.mockRejectedValue(new Error("policy_version_not_approved"));
    const response = await activateRoute.POST(new Request("http://localhost", {
      method: "POST",
      body: JSON.stringify({ reason: "Activate only after a separate approval" }),
    }), { params: Promise.resolve({ versionId: VERSION_ID }) });
    expect(response.status).toBe(409);
    expect((await response.json()).error.code).toBe("CONFLICT");
  });
});

describe("Access Control Audit Log", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    allowSuperAdmin();
  });

  it("is GET-only", () => {
    expect(auditRoute).not.toHaveProperty("POST");
    expect(auditRoute).not.toHaveProperty("PATCH");
    expect(auditRoute).not.toHaveProperty("DELETE");
  });

  it("recursively removes non-allowlisted metadata and secrets", () => {
    const sanitized = auditRoute.sanitizeAuditPayload({
      capabilityKey: "wallet.request_withdrawal",
      subjectId: ACTOR_ID,
      email: "secret@example.com",
      phone: "+60123456789",
      kycDocumentPath: "private/kyc/front.png",
      provider: { secret: "sk_live_secret", generation: 20 },
      nested: [{ policyId: POLICY_ID, icHash: "hash", payoutSecret: "secret" }],
      status: "active",
    });
    expect(sanitized).toEqual({
      capabilityKey: "wallet.request_withdrawal",
      subjectId: ACTOR_ID,
      status: "active",
    });
    expect(JSON.stringify(sanitized)).not.toMatch(/secret@example|601234|front\.png|sk_live|icHash|payoutSecret/);
  });

  it("returns only sanitized payloads from the Audit Log route", async () => {
    const builder = queryBuilder([{
      id: AUDIT_ID,
      actor_id: ACTOR_ID,
      action: "entitlement.assignment.set",
      entity_type: "entitlement_assignment",
      entity_id: ASSIGNMENT_ID,
      before_data: { email: "secret@example.com", status: "inactive", providerSecret: "sk_live_secret" },
      after_data: { assignmentId: ASSIGNMENT_ID, status: "active", phone: "+60123456789", kycDocumentPath: "kyc/private.png" },
      note: "Reviewed for secret@example.com at +60123456789",
      created_at: "2026-08-30T00:00:00.000Z",
    }]);
    mocks.requireSuperAdmin.mockResolvedValue({
      db: { from: vi.fn(() => builder) },
      user: { id: ACTOR_ID },
      response: null,
    });

    const response = await auditRoute.GET(new Request("http://localhost/api/admin/access-control/audit-log?page=1&pageSize=25"));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.data.items[0]).toMatchObject({
      before: { status: "inactive" },
      after: { assignmentId: ASSIGNMENT_ID, status: "active" },
      reason: null,
    });
    expect(JSON.stringify(body)).not.toMatch(/secret@example|60123456789|sk_live_secret|kyc\/private/);
  });

  it("never exposes free-form audit notes that can contain unbounded secrets", async () => {
    const builder = queryBuilder([{
      id: AUDIT_ID,
      actor_id: ACTOR_ID,
      action: "entitlement.assignment.set",
      entity_type: "entitlement_assignment",
      entity_id: ASSIGNMENT_ID,
      before_data: null,
      after_data: { assignmentId: ASSIGNMENT_ID, status: "active" },
      note: "Call 012-3456789 with whsec_provider_secret; file uploads/kyc_documents/front.png",
      created_at: "2026-08-30T00:00:00.000Z",
    }]);
    mocks.requireSuperAdmin.mockResolvedValue({
      db: { from: vi.fn(() => builder) },
      user: { id: ACTOR_ID },
      response: null,
    });

    const response = await auditRoute.GET(new Request("http://localhost/api/admin/access-control/audit-log"));
    const body = await response.json();
    expect(body.data.items[0].reason).toBeNull();
    expect(JSON.stringify(body)).not.toMatch(/012-3456789|whsec_provider_secret|kyc_documents/);
  });

  it("applies strict Audit Log filters and database pagination", async () => {
    const builder = queryBuilder([]);
    mocks.requireSuperAdmin.mockResolvedValue({
      db: { from: vi.fn(() => builder) },
      user: { id: ACTOR_ID },
      response: null,
    });
    const url = new URL("http://localhost/api/admin/access-control/audit-log");
    url.searchParams.set("page", "2");
    url.searchParams.set("pageSize", "25");
    url.searchParams.set("actorId", ACTOR_ID);
    url.searchParams.set("actionPrefix", "entitlement.policy");
    url.searchParams.set("entityType", "entitlement_policy_version");
    url.searchParams.set("entityId", VERSION_ID);
    url.searchParams.set("capabilityKey", "commerce.checkout");
    url.searchParams.set("policyId", POLICY_ID);
    url.searchParams.set("traceReference", "trace:task-8");
    url.searchParams.set("dateFrom", "2026-08-01T00:00:00.000Z");
    url.searchParams.set("dateTo", "2026-08-31T23:59:59.000Z");

    const response = await auditRoute.GET(new Request(url));
    expect(response.status).toBe(200);
    expect(builder.eq).toHaveBeenCalledWith("actor_id", ACTOR_ID);
    expect(builder.eq).toHaveBeenCalledWith("entity_type", "entitlement_policy_version");
    expect(builder.eq).toHaveBeenCalledWith("entity_id", VERSION_ID);
    expect(builder.gte).toHaveBeenCalledWith("action", "entitlement.policy");
    expect(builder.gte).toHaveBeenCalledWith("created_at", "2026-08-01T00:00:00.000Z");
    expect(builder.lte).toHaveBeenCalledWith("created_at", "2026-08-31T23:59:59.000Z");
    expect(builder.range).toHaveBeenCalledWith(25, 49);
    expect(builder.or).toHaveBeenCalledTimes(3);
  });
});
