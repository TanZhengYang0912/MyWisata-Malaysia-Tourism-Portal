import { beforeEach, describe, expect, it, vi } from "vitest";
import { makeFakeDb } from "@/lib/events/__tests__/event-staff-fake-db";

const VENDOR_ID = "22222222-2222-4222-8222-222222222222";
const CAMPAIGN_ID = "77777777-7777-4777-8777-777777777777";
const LOCATION_ID = "33333333-3333-4333-8333-333333333333";
const MEMBER_ID = "99999999-9999-4999-8999-999999999999";

const mocks = vi.hoisted(() => ({ authorizeVendor: vi.fn() }));
vi.mock("@/lib/vendor-authorization", () => ({ authorizeVendor: mocks.authorizeVendor }));

import { DELETE, PATCH } from "../route";

const params = (memberId = MEMBER_ID) => ({ params: Promise.resolve({ vendorId: VENDOR_ID, locationId: LOCATION_ID, memberId }) });

function setup(removedAt: string | null = null) {
  const fake = makeFakeDb({
    event_staff_members: [{ id: MEMBER_ID, vendor_id: VENDOR_ID, campaign_id: CAMPAIGN_ID, event_location_id: LOCATION_ID, user_id: "staff-1", removed_at: removedAt }],
  });
  mocks.authorizeVendor.mockResolvedValue({ ok: true, access: { userId: "owner-1", serviceDb: fake.db } });
  return fake;
}

describe("owner removes event staff", () => {
  beforeEach(() => vi.clearAllMocks());

  it("removes once, records it once, and stays idempotent", async () => {
    const fake = setup();
    const first = await DELETE(new Request("http://localhost/x", { method: "DELETE" }), params());
    expect(first.status).toBe(200);
    expect(mocks.authorizeVendor).toHaveBeenCalledWith(VENDOR_ID, ["vendor_owner"], { allowEventVendor: true, requireApproved: true });
    expect(fake.writes[0]).toMatchObject({ table: "event_staff_members", op: "update", values: { removed_by: "owner-1" } });
    expect(fake.writes.filter((write) => write.table === "audit_logs")).toHaveLength(1);

    const second = await DELETE(new Request("http://localhost/x", { method: "DELETE" }), params());
    expect(second.status).toBe(200);
    expect(fake.writes.filter((write) => write.table === "audit_logs")).toHaveLength(1);
  });

  it("returns 404 for a member of another vendor or stall", async () => {
    setup();
    const response = await DELETE(new Request("http://localhost/x", { method: "DELETE" }), params("88888888-8888-4888-8888-888888888888"));
    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toMatchObject({ error: { code: "MEMBER_NOT_FOUND" } });
  });
});

describe("owner approves and restores event staff", () => {
  beforeEach(() => vi.clearAllMocks());

  const patch = (action: string, memberId = MEMBER_ID) => PATCH(new Request("http://localhost/x", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action }),
  }), params(memberId));

  function setupMember(member: { approved_at: string | null; removed_at: string | null }, options: { participating?: boolean } = {}) {
    const row = { id: MEMBER_ID, vendor_id: VENDOR_ID, campaign_id: CAMPAIGN_ID, event_location_id: LOCATION_ID, user_id: "staff-1", ...member };
    const fake = makeFakeDb({
      event_staff_members: [row],
      promotion_campaign_vendors: options.participating === false ? [] : [{ id: "r1", vendor_id: VENDOR_ID, campaign_id: CAMPAIGN_ID, event_location_id: LOCATION_ID, status: "approved", promotion_campaign_locations: { name: "Bangsar", ends_on: "2999-01-01", status: "active" } }],
    });
    mocks.authorizeVendor.mockResolvedValue({ ok: true, access: { userId: "owner-1", serviceDb: fake.db } });
    return { fake, row };
  }

  it("approves a pending member once, audits once, and stays idempotent", async () => {
    const { fake, row } = setupMember({ approved_at: null, removed_at: null });
    const first = await patch("approve");
    expect(first.status).toBe(200);
    expect(mocks.authorizeVendor).toHaveBeenCalledWith(VENDOR_ID, ["vendor_owner"], { allowEventVendor: true, requireApproved: true });
    expect(row).toMatchObject({ approved_by: "owner-1", removed_at: null });
    expect(row.approved_at).toEqual(expect.any(String));
    expect(fake.writes.find((write) => write.table === "audit_logs")).toMatchObject({ values: { action: "event_staff.approved", actor_id: "owner-1", entity_id: MEMBER_ID } });

    const second = await patch("approve");
    expect(second.status).toBe(200);
    expect(fake.writes.filter((write) => write.table === "audit_logs")).toHaveLength(1);
  });

  it("restores a removed member and clears the removal", async () => {
    const { fake, row } = setupMember({ approved_at: "2026-11-12T00:00:00Z", removed_at: "2026-11-13T00:00:00Z" });
    const response = await patch("restore");
    expect(response.status).toBe(200);
    expect(row).toMatchObject({ removed_at: null, removed_by: null, approved_by: "owner-1" });
    expect(fake.writes.find((write) => write.table === "audit_logs")).toMatchObject({ values: { action: "event_staff.restored" } });
  });

  it("will not approve a removed member (only restore re-admits)", async () => {
    const { fake, row } = setupMember({ approved_at: "2026-11-12T00:00:00Z", removed_at: "2026-11-13T00:00:00Z" });
    const response = await patch("approve");
    expect(response.status).toBe(409);
    expect(row.removed_at).toBe("2026-11-13T00:00:00Z");
    expect(fake.writes.filter((write) => write.table === "audit_logs")).toHaveLength(0);
  });

  it("refuses to grant access without an approved stall at this location", async () => {
    const { fake } = setupMember({ approved_at: null, removed_at: null }, { participating: false });
    const response = await patch("approve");
    expect(response.status).toBe(404);
    expect(fake.writes).toHaveLength(0);
  });

  it("returns 404 for a member of another vendor or stall", async () => {
    setupMember({ approved_at: null, removed_at: null });
    const response = await patch("approve", "88888888-8888-4888-8888-888888888888");
    expect(response.status).toBe(404);
  });

  it("rejects an unknown action and non-owners", async () => {
    setupMember({ approved_at: null, removed_at: null });
    expect((await patch("promote")).status).toBe(422);
    mocks.authorizeVendor.mockResolvedValue({ ok: false, response: new Response(null, { status: 403 }) });
    expect((await patch("approve")).status).toBe(403);
  });
});
