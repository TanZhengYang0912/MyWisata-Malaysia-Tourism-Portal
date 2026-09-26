import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  entity: {
    id: "c7712d04-8c53-4f1d-ab57-f1da28c29f2a",
    vendor_id: "4f774340-2bce-de7d-dc27-8208f1286b59",
    review_status: "pending_review",
    status: "inactive",
  },
  reviewRecord: null as Record<string, unknown> | null,
  insertError: null as { message: string } | null,
}));

vi.mock("@/lib/staff-permissions/server", () => ({
  requireStaffPermission: vi.fn(async () => ({ user: { id: "aaaaaaaa-0000-0000-0000-000000000001" } })),
}));

vi.mock("@/lib/supabase/service", () => ({
  createServiceClient: vi.fn(() => ({
    from: (table: string) => ({
      select: () => ({
        eq: () => ({
          single: async () => ({ data: table === "products" ? state.entity : null, error: null }),
        }),
      }),
      update: (values: Record<string, unknown>) => ({
        eq: () => ({
          select: () => ({
            single: async () => ({ data: { ...state.entity, ...values }, error: null }),
          }),
        }),
      }),
      insert: (record: Record<string, unknown>) => {
        state.reviewRecord = record;
        return Promise.resolve({ error: state.insertError });
      },
    }),
  })),
}));

vi.mock("@/lib/audit", () => ({ auditAndNotify: vi.fn(async () => undefined) }));
vi.mock("@/lib/vendor-notifications/emit", () => ({ emitVendorNotification: vi.fn(async () => undefined) }));

import { POST } from "@/app/api/admin/catalogue/reviews/route";

describe("POST /api/admin/catalogue/reviews", () => {
  beforeEach(() => {
    state.reviewRecord = null;
    state.insertError = null;
  });

  it.each([
    ["approve", "approved"],
    ["reject", "rejected"],
    ["change_requested", "change_requested"],
  ])("stores the database review state for %s", async (action, expectedStoredAction) => {
    const response = await POST(new Request("http://localhost/api/admin/catalogue/reviews", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        entityType: "product",
        entityId: state.entity.id,
        action,
        ...(action === "approve" ? {} : { note: "Please update the submitted listing." }),
      }),
    }));

    if (!response) throw new Error("The catalogue review route did not return a response");
    expect(response.status).toBe(200);
    const payload = await response.json() as { data: { review_status: string } };
    expect(payload.data.review_status).toBe(expectedStoredAction);
    expect(state.reviewRecord?.action).toBe(expectedStoredAction);
  });

  it("does not report a complete review when the review history insert fails", async () => {
    state.insertError = { message: "history insert failed" };
    const response = await POST(new Request("http://localhost/api/admin/catalogue/reviews", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        entityType: "product",
        entityId: state.entity.id,
        action: "approve",
      }),
    }));

    if (!response) throw new Error("The catalogue review route did not return a response");
    expect(response.status).toBe(500);
    expect(await response.json()).toMatchObject({ error: { code: "DB_ERROR" } });
  });
});
