import { beforeEach, describe, expect, it, vi } from "vitest";
import { makeFakeDb } from "@/lib/events/__tests__/event-staff-fake-db";

const VENDOR_ID = "22222222-2222-4222-8222-222222222222";
const CAMPAIGN_ID = "77777777-7777-4777-8777-777777777777";
const MEMBER_ID = "99999999-9999-4999-8999-999999999999";

const mocks = vi.hoisted(() => ({ authorizeVendor: vi.fn() }));
vi.mock("@/lib/vendor-authorization", () => ({ authorizeVendor: mocks.authorizeVendor }));

import { DELETE } from "../route";

const params = (memberId = MEMBER_ID) => ({ params: Promise.resolve({ vendorId: VENDOR_ID, campaignId: CAMPAIGN_ID, memberId }) });

function setup(removedAt: string | null = null) {
  const fake = makeFakeDb({
    event_staff_members: [{ id: MEMBER_ID, vendor_id: VENDOR_ID, campaign_id: CAMPAIGN_ID, user_id: "staff-1", removed_at: removedAt }],
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

  it("returns 404 for a member of another vendor or event", async () => {
    setup();
    const response = await DELETE(new Request("http://localhost/x", { method: "DELETE" }), params("88888888-8888-4888-8888-888888888888"));
    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toMatchObject({ error: { code: "MEMBER_NOT_FOUND" } });
  });
});
