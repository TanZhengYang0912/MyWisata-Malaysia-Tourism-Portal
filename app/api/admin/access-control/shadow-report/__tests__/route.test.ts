import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireSuperAdmin: vi.fn(),
  query: vi.fn(),
}));

vi.mock("@/lib/entitlements/admin-guard", () => ({
  requireAccessControlSuperAdmin: mocks.requireSuperAdmin,
}));

import * as route from "@/app/api/admin/access-control/shadow-report/route";

const ACTOR_ID = "11111111-1111-4111-8111-111111111111";

function queryBuilder(rows: unknown[] = [], count = rows.length) {
  const builder: Record<string, unknown> = {};
  for (const method of ["select", "eq", "is", "gte", "lte", "order"]) {
    builder[method] = vi.fn(() => builder);
  }
  builder.range = vi.fn(async () => ({ data: rows, error: null, count }));
  return builder;
}

function allowSuperAdmin(rows: unknown[] = [], count = rows.length) {
  const query = queryBuilder(rows, count);
  const db = { from: vi.fn(() => query) };
  mocks.requireSuperAdmin.mockResolvedValue({ db, user: { id: ACTOR_ID }, response: null });
  return { db, query };
}

function denied(code: string, status: number) {
  return Response.json({ data: null, error: { code, message: code } }, { status });
}

describe("Access Control shadow report", () => {
  beforeEach(() => vi.clearAllMocks());

  it.each([
    ["unauthenticated", "UNAUTHORIZED", 401],
    ["non-Super Admin", "FORBIDDEN", 403],
  ])("denies %s callers", async (_label, code, status) => {
    mocks.requireSuperAdmin.mockResolvedValue({ db: {}, user: null, response: denied(code as string, status as number) });

    const response = await route.GET(new Request("http://localhost/api/admin/access-control/shadow-report"));
    expect(response.status).toBe(status);
    expect((await response.json()).error.code).toBe(code);
  });

  it("is a read-only route", () => {
    expect(route.GET).toBeTypeOf("function");
    expect("POST" in route).toBe(false);
    expect("PATCH" in route).toBe(false);
    expect("DELETE" in route).toBe(false);
  });

  it.each([
    "?page=0",
    "?pageSize=101",
    "?classification=unknown",
    "?capability=email",
  ])("rejects invalid or unbounded filters: %s", async (search) => {
    allowSuperAdmin();
    const response = await route.GET(new Request(`http://localhost/api/admin/access-control/shadow-report${search}`));
    expect(response.status).toBe(422);
    expect((await response.json()).error.code).toBe("VALIDATION_FAILED");
  });

  it("returns bounded pagination and only sanitized stable comparison fields", async () => {
    const { db, query } = allowSuperAdmin([{
      id: "22222222-2222-4222-8222-222222222222",
      actor_id: null,
      after_data: {
        userHash: "a".repeat(64),
        capability: "wallet.request_withdrawal",
        legacyAllowed: false,
        entitlementAllowed: true,
        classification: "expected_change",
        blocking: false,
        entitlementGeneration: 31,
        email: "person@example.com",
        phone: "+60123456789",
        kycEvidence: "private/kyc/document.png",
        assignmentReason: "secret",
        amount: 999.99,
      },
      created_at: "2026-08-30T01:00:00.000Z",
    }], 51);

    const response = await route.GET(new Request(
      "http://localhost/api/admin/access-control/shadow-report?page=2&pageSize=25&classification=expected_change&capability=wallet.request_withdrawal",
    ));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(db.from).toHaveBeenCalledWith("audit_logs");
    expect(query.eq).toHaveBeenCalledWith("action", "entitlement.shadow_evaluation");
    expect(query.is).toHaveBeenCalledWith("actor_id", null);
    expect(query.eq).toHaveBeenCalledWith("after_data->>classification", "expected_change");
    expect(query.eq).toHaveBeenCalledWith("after_data->>capability", "wallet.request_withdrawal");
    expect(query.range).toHaveBeenCalledWith(25, 49);
    expect(body.data).toEqual({
      items: [{
        id: "22222222-2222-4222-8222-222222222222",
        userHash: "a".repeat(64),
        capability: "wallet.request_withdrawal",
        legacyAllowed: false,
        entitlementAllowed: true,
        classification: "expected_change",
        blocking: false,
        entitlementGeneration: 31,
        createdAt: "2026-08-30T01:00:00.000Z",
      }],
      page: 2,
      pageSize: 25,
      total: 51,
      totalPages: 3,
    });
    expect(JSON.stringify(body)).not.toMatch(/person@example|60123456789|private\/kyc|secret|999\.99/);
  });

  it("drops malformed telemetry rows rather than exposing unvalidated data", async () => {
    allowSuperAdmin([{
      id: "bad-row",
      after_data: {
        userHash: "not-a-hash",
        capability: "wallet.request_withdrawal",
        legacyAllowed: false,
        entitlementAllowed: true,
        classification: "expected_change",
        blocking: false,
        entitlementGeneration: 31,
      },
      created_at: "2026-08-30T01:00:00.000Z",
    }]);

    const response = await route.GET(new Request("http://localhost/api/admin/access-control/shadow-report"));
    expect((await response.json()).data.items).toEqual([]);
  });

  it("drops rows that are not system-authored even if a query adapter returns them", async () => {
    allowSuperAdmin([{
      id: "22222222-2222-4222-8222-222222222222",
      actor_id: ACTOR_ID,
      after_data: {
        userHash: "a".repeat(64),
        capability: "wallet.request_withdrawal",
        legacyAllowed: false,
        entitlementAllowed: true,
        classification: "expected_change",
        blocking: false,
        entitlementGeneration: 31,
      },
      created_at: "2026-08-30T01:00:00.000Z",
    }]);

    const response = await route.GET(new Request("http://localhost/api/admin/access-control/shadow-report"));
    expect((await response.json()).data.items).toEqual([]);
  });
});
