import { describe, expect, it } from "vitest";
import {
  activeEventStaffLocationIds,
  approvedStall,
  resolveActiveStaffLink,
  stallAccessEndsAt,
} from "@/lib/events/event-staff";
import { signEventStaffLinkToken } from "@/lib/events/event-staff-link-token";
import { makeFakeDb } from "./event-staff-fake-db";

const NOW = new Date("2026-11-20T03:00:00Z");
// A stall that runs until 23 Nov (Malaysia time), one that ended, one cancelled.
const LIVE_STALL = { name: "Gurney Drive", ends_on: "2026-11-23", status: "active" };
const ENDED_STALL = { name: "Old Hall", ends_on: "2026-11-01", status: "active" };
const CANCELLED_STALL = { name: "Cancelled Hall", ends_on: "2026-11-23", status: "cancelled" };
const LINK_ID = "5f2c9a41-7e0b-4c1d-9a2e-3b8d6f1c0e77";
const APPROVED = "2026-11-18T00:00:00Z";

describe("stallAccessEndsAt", () => {
  it("ends at the close of the stall's last day in Malaysia time", () => {
    expect(stallAccessEndsAt("2026-11-23")).toBe("2026-11-23T15:59:59.999Z");
  });
});

describe("activeEventStaffLocationIds", () => {
  const { db } = makeFakeDb({
    event_staff_members: [
      { user_id: "u1", vendor_id: "v1", event_location_id: "loc-live", removed_at: null, approved_at: APPROVED, promotion_campaign_locations: LIVE_STALL },
      { user_id: "u1", vendor_id: "v1", event_location_id: "loc-ended", removed_at: null, approved_at: APPROVED, promotion_campaign_locations: ENDED_STALL },
      { user_id: "u1", vendor_id: "v1", event_location_id: "loc-cancelled", removed_at: null, approved_at: APPROVED, promotion_campaign_locations: CANCELLED_STALL },
      { user_id: "u1", vendor_id: "v1", event_location_id: "loc-removed", removed_at: "2026-11-19T00:00:00Z", approved_at: APPROVED, promotion_campaign_locations: LIVE_STALL },
      { user_id: "u1", vendor_id: "v1", event_location_id: "loc-pending", removed_at: null, approved_at: null, promotion_campaign_locations: LIVE_STALL },
      { user_id: "u1", vendor_id: "v2", event_location_id: "loc-other-vendor", removed_at: null, approved_at: APPROVED, promotion_campaign_locations: LIVE_STALL },
    ],
  });

  it("keeps only approved, running stalls for this vendor", async () => {
    await expect(activeEventStaffLocationIds(db, "u1", "v1", NOW)).resolves.toEqual({ locationIds: ["loc-live"], error: null });
  });

  it("drops access once the stall's last day has ended", async () => {
    const lastMinute = new Date("2026-11-23T15:59:00Z");
    const nextDay = new Date("2026-11-23T16:00:00Z");
    await expect(activeEventStaffLocationIds(db, "u1", "v1", lastMinute)).resolves.toEqual({ locationIds: ["loc-live"], error: null });
    await expect(activeEventStaffLocationIds(db, "u1", "v1", nextDay)).resolves.toEqual({ locationIds: [], error: null });
  });

  it("reports a read failure instead of granting nothing silently", async () => {
    const failing = makeFakeDb({}, { failTables: ["event_staff_members"] }).db;
    const result = await activeEventStaffLocationIds(failing, "u1", "v1", NOW);
    expect(result.locationIds).toEqual([]);
    expect(result.error).toBeInstanceOf(Error);
  });
});

describe("approvedStall", () => {
  const { db } = makeFakeDb({
    promotion_campaign_vendors: [
      { id: "r1", vendor_id: "v1", campaign_id: "c1", event_location_id: "loc-pending", status: "pending", promotion_campaign_locations: LIVE_STALL },
      { id: "r2", vendor_id: "v1", campaign_id: "c1", event_location_id: "loc-1", status: "approved", promotion_campaign_locations: LIVE_STALL },
      { id: "r3", vendor_id: "v1", campaign_id: "c1", event_location_id: "loc-ended", status: "approved", promotion_campaign_locations: ENDED_STALL },
    ],
  });

  it("needs an approved registration at that exact stall", async () => {
    await expect(approvedStall(db, "v1", "loc-pending", NOW)).resolves.toEqual({ stall: null, error: null });
    await expect(approvedStall(db, "v2", "loc-1", NOW)).resolves.toEqual({ stall: null, error: null });
    await expect(approvedStall(db, "v1", "loc-1", NOW)).resolves.toEqual({
      stall: { campaignId: "c1", locationName: "Gurney Drive", endsOn: "2026-11-23", isLive: true },
      error: null,
    });
  });

  it("marks an ended stall as not live", async () => {
    await expect(approvedStall(db, "v1", "loc-ended", NOW)).resolves.toMatchObject({ stall: { isLive: false } });
  });
});

describe("resolveActiveStaffLink", () => {
  // Signed and verified with the same runtime secret.
  const token = signEventStaffLinkToken(LINK_ID);

  function seed(overrides: Record<string, unknown> = {}, stall: { status?: string; location?: Record<string, unknown> } = {}) {
    return makeFakeDb({
      event_staff_links: [{
        id: LINK_ID, vendor_id: "v1", campaign_id: "c1", event_location_id: "loc-1", revoked_at: null,
        vendors: { name: "Nasi Lemak Kak Ros", status: "approved" }, promotion_campaigns: { title: "Penang Food Fair" }, ...overrides,
      }],
      promotion_campaign_vendors: [{
        id: "r1", vendor_id: "v1", campaign_id: "c1", event_location_id: "loc-1", status: stall.status ?? "approved",
        promotion_campaign_locations: stall.location ?? LIVE_STALL,
      }],
    }).db;
  }

  it("returns the stall's public link details for a usable link", async () => {
    await expect(resolveActiveStaffLink(seed(), token, NOW)).resolves.toEqual({
      link: {
        linkId: LINK_ID, vendorId: "v1", vendorName: "Nasi Lemak Kak Ros",
        campaignId: "c1", campaignTitle: "Penang Food Fair",
        locationId: "loc-1", locationName: "Gurney Drive", expiresAt: "2026-11-23T15:59:59.999Z",
      },
      error: null,
    });
  });

  it.each([
    ["a bad signature", seed(), `${token.slice(0, -10)}AAAAAAAAAA`],
    ["a revoked link", seed({ revoked_at: "2026-11-19T00:00:00Z" }), token],
    ["an ended stall", seed({}, { location: ENDED_STALL }), token],
    ["a cancelled stall", seed({}, { location: CANCELLED_STALL }), token],
    ["an unapproved vendor", seed({ vendors: { name: "X", status: "suspended" } }), token],
    ["a withdrawn stall registration", seed({}, { status: "withdrawn" }), token],
    ["an unknown link", makeFakeDb({}).db, token],
  ])("returns no link for %s", async (_label, db, value) => {
    await expect(resolveActiveStaffLink(db, value, NOW)).resolves.toEqual({ link: null, error: null });
  });
});
