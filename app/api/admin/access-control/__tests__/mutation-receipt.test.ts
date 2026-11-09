import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ getGeneration: vi.fn() }));

vi.mock("@/lib/entitlements/admin", () => ({ getAccessControlGeneration: mocks.getGeneration }));

import { mutationReceipt } from "@/app/api/admin/access-control/_shared";

function auditQuery(result: { data: { id: string } | null; error: Error | null }) {
  const query: Record<string, unknown> = {};
  for (const method of ["select", "eq", "order", "limit"]) query[method] = vi.fn(() => query);
  query.maybeSingle = vi.fn(async () => result);
  return query;
}

describe("Access Control mutation receipts", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns a committed, refresh-required receipt when audit lookup fails", async () => {
    const db = { from: vi.fn(() => auditQuery({ data: null, error: new Error("read failed") })) };
    mocks.getGeneration.mockResolvedValue(8);

    const response = await mutationReceipt(db as never, "actor-1", "staff.role.revoked", "entity-1", { assignmentId: "entity-1" });

    expect(response.status).toBe(202);
    expect(await response.json()).toMatchObject({
      data: { committed: true, entityId: "entity-1", action: "staff.role.revoked", auditEventId: null, generation: 8, receiptAvailable: false },
    });
  });

  it("returns a committed, refresh-required receipt when state refresh fails", async () => {
    const db = { from: vi.fn(() => auditQuery({ data: { id: "audit-1" }, error: null })) };
    mocks.getGeneration.mockRejectedValue(new Error("state unavailable"));

    const response = await mutationReceipt(db as never, "actor-1", "staff.role.updated", "role-1", { roleId: "role-1" });

    expect(response.status).toBe(202);
    expect(await response.json()).toMatchObject({
      data: { committed: true, entityId: "role-1", action: "staff.role.updated", auditEventId: "audit-1", generation: null, receiptAvailable: false },
    });
  });
});
