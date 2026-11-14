import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { makeFakeDb, type Row } from "@/lib/events/__tests__/event-staff-fake-db";

const mocks = vi.hoisted(() => ({ userId: "staff-1", authDb: null as unknown, serviceDb: null as unknown }));
vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser: async () => ({ data: { user: { id: mocks.userId } }, error: null }) },
    from: (table: string) => (mocks.authDb as SupabaseClient).from(table),
  })),
}));
vi.mock("@/lib/supabase/service", () => ({ createServiceClient: () => mocks.serviceDb }));

import { authorizeVendor } from "../vendor-authorization";

const LIVE = { ends_at: "2999-01-01T00:00:00Z" };
const ENDED = { ends_at: "2000-01-01T00:00:00Z" };

function setup({
  kind = "shop",
  visibleToCaller = true,
  status = "approved",
  members = [{ user_id: "staff-1", vendor_id: "v1", campaign_id: "c1", removed_at: null, promotion_campaigns: LIVE }] as Row[],
  managers = [] as Row[],
} = {}) {
  const vendor = { id: "v1", owner_id: "owner-1", status, kind };
  mocks.authDb = makeFakeDb({ vendors: visibleToCaller ? [vendor] : [], outlet_managers: managers, outlets: [{ id: "o1", vendor_id: "v1" }] }).db;
  mocks.serviceDb = makeFakeDb({ vendors: [vendor], event_staff_members: members }).db;
}

describe("authorizeVendor event staff", () => {
  beforeEach(() => { mocks.userId = "staff-1"; });

  it("lets live event staff in only when the route opts in", async () => {
    setup();
    const allowed = await authorizeVendor("v1", undefined, { allowEventVendor: true, allowEventStaff: true });
    expect(allowed.ok).toBe(true);
    if (allowed.ok) {
      expect(allowed.access).toMatchObject({ role: "event_staff", outletIds: [], eventCampaignIds: ["c1"], isOwner: false, isOutletManager: false });
    }

    const closed = await authorizeVendor("v1", undefined, { allowEventVendor: true });
    expect(closed.ok).toBe(false);
    if (!closed.ok) expect(closed.response.status).toBe(403);
  });

  it("works for event vendors as well as shop vendors", async () => {
    setup({ kind: "event" });
    const result = await authorizeVendor("v1", undefined, { allowEventVendor: true, allowEventStaff: true });
    expect(result.ok && result.access.role).toBe("event_staff");
  });

  it("finds staff when RLS hides the vendor row from the caller", async () => {
    setup({ visibleToCaller: false });
    const result = await authorizeVendor("v1", undefined, { allowEventVendor: true, allowEventStaff: true });
    expect(result.ok && result.access.role).toBe("event_staff");
  });

  it("rejects staff of an unapproved vendor on the hidden-vendor path", async () => {
    setup({ visibleToCaller: false, status: "suspended" });
    const result = await authorizeVendor("v1", undefined, { allowEventVendor: true, allowEventStaff: true });
    expect(result.ok).toBe(false);
  });

  it.each([
    ["removed", [{ user_id: "staff-1", vendor_id: "v1", campaign_id: "c1", removed_at: "2026-11-19T00:00:00Z", promotion_campaigns: LIVE }]],
    ["after the event ends", [{ user_id: "staff-1", vendor_id: "v1", campaign_id: "c1", removed_at: null, promotion_campaigns: ENDED }]],
    ["for another vendor", [{ user_id: "staff-1", vendor_id: "v2", campaign_id: "c1", removed_at: null, promotion_campaigns: LIVE }]],
  ])("rejects staff %s", async (_label, members) => {
    setup({ members });
    const result = await authorizeVendor("v1", undefined, { allowEventVendor: true, allowEventStaff: true });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.response.status).toBe(403);
  });

  it("keeps the owner as owner even with the staff option", async () => {
    mocks.userId = "owner-1";
    setup();
    const result = await authorizeVendor("v1", undefined, { allowEventVendor: true, allowEventStaff: true });
    expect(result.ok && result.access).toMatchObject({ role: "vendor_owner", eventCampaignIds: [] });
  });

  it("keeps an outlet manager as manager even when also staff", async () => {
    setup({ managers: [{ user_id: "staff-1", outlet_id: "o1", outlets: { vendor_id: "v1" } }] });
    const result = await authorizeVendor("v1", undefined, { allowEventVendor: true, allowEventStaff: true });
    expect(result.ok && result.access).toMatchObject({ role: "outlet_manager", outletIds: ["o1"], eventCampaignIds: [] });
  });
});
