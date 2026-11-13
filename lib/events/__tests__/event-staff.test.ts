import { describe, expect, it } from "vitest";
import {
  activeEventStaffCampaignIds,
  isEventLocationInCampaigns,
  resolveActiveStaffLink,
  vendorHasApprovedRegistration,
} from "@/lib/events/event-staff";
import { signEventStaffLinkToken } from "@/lib/events/event-staff-link-token";
import { makeFakeDb } from "./event-staff-fake-db";

const NOW = new Date("2026-11-20T03:00:00Z");
const LIVE = { title: "Penang Food Fair", ends_at: "2026-11-23T15:59:59Z" };
const ENDED = { title: "Old Fair", ends_at: "2026-11-01T15:59:59Z" };
const LINK_ID = "5f2c9a41-7e0b-4c1d-9a2e-3b8d6f1c0e77";

describe("activeEventStaffCampaignIds", () => {
  const { db } = makeFakeDb({
    event_staff_members: [
      { user_id: "u1", vendor_id: "v1", campaign_id: "c-live", removed_at: null, promotion_campaigns: LIVE },
      { user_id: "u1", vendor_id: "v1", campaign_id: "c-ended", removed_at: null, promotion_campaigns: ENDED },
      { user_id: "u1", vendor_id: "v1", campaign_id: "c-removed", removed_at: "2026-11-19T00:00:00Z", promotion_campaigns: LIVE },
      { user_id: "u1", vendor_id: "v2", campaign_id: "c-other-vendor", removed_at: null, promotion_campaigns: LIVE },
    ],
  });

  it("keeps only live memberships for this vendor", async () => {
    await expect(activeEventStaffCampaignIds(db, "u1", "v1", NOW)).resolves.toEqual({ campaignIds: ["c-live"], error: null });
  });

  it("drops access once the campaign has ended", async () => {
    const later = new Date("2026-11-24T00:00:00Z");
    await expect(activeEventStaffCampaignIds(db, "u1", "v1", later)).resolves.toEqual({ campaignIds: [], error: null });
  });

  it("reports a read failure instead of granting nothing silently", async () => {
    const failing = makeFakeDb({}, { failTables: ["event_staff_members"] }).db;
    const result = await activeEventStaffCampaignIds(failing, "u1", "v1", NOW);
    expect(result.campaignIds).toEqual([]);
    expect(result.error).toBeInstanceOf(Error);
  });
});

describe("isEventLocationInCampaigns", () => {
  const { db } = makeFakeDb({ promotion_campaign_locations: [{ id: "loc-1", campaign_id: "c-live" }, { id: "loc-2", campaign_id: "c-other" }] });

  it("maps the location to its campaign before comparing", async () => {
    await expect(isEventLocationInCampaigns(db, "loc-1", ["c-live"])).resolves.toEqual({ inScope: true, error: null });
    await expect(isEventLocationInCampaigns(db, "loc-2", ["c-live"])).resolves.toEqual({ inScope: false, error: null });
    await expect(isEventLocationInCampaigns(db, "loc-missing", ["c-live"])).resolves.toEqual({ inScope: false, error: null });
  });

  it("never treats a location id as a campaign id", async () => {
    await expect(isEventLocationInCampaigns(db, "loc-1", ["loc-1"])).resolves.toEqual({ inScope: false, error: null });
  });

  it("is out of scope without campaigns", async () => {
    await expect(isEventLocationInCampaigns(db, "loc-1", [])).resolves.toEqual({ inScope: false, error: null });
  });
});

describe("vendorHasApprovedRegistration", () => {
  const { db } = makeFakeDb({
    promotion_campaign_vendors: [
      { id: "r1", vendor_id: "v1", campaign_id: "c1", status: "pending" },
      { id: "r2", vendor_id: "v1", campaign_id: "c2", status: "approved" },
    ],
  });

  it("needs at least one approved registration in that campaign", async () => {
    await expect(vendorHasApprovedRegistration(db, "v1", "c1")).resolves.toEqual({ approved: false, error: null });
    await expect(vendorHasApprovedRegistration(db, "v1", "c2")).resolves.toEqual({ approved: true, error: null });
  });
});

describe("resolveActiveStaffLink", () => {
  // Signed and verified with the same runtime secret.
  const token = signEventStaffLinkToken(LINK_ID);

  function seed(overrides: Record<string, unknown> = {}, registrationStatus = "approved") {
    return makeFakeDb({
      event_staff_links: [{
        id: LINK_ID, vendor_id: "v1", campaign_id: "c1", revoked_at: null,
        vendors: { name: "Nasi Lemak Kak Ros", status: "approved" }, promotion_campaigns: LIVE, ...overrides,
      }],
      promotion_campaign_vendors: [{ id: "r1", vendor_id: "v1", campaign_id: "c1", status: registrationStatus }],
    }).db;
  }

  it("returns the public link details for a usable link", async () => {
    await expect(resolveActiveStaffLink(seed(), token, NOW)).resolves.toEqual({
      link: {
        linkId: LINK_ID, vendorId: "v1", vendorName: "Nasi Lemak Kak Ros",
        campaignId: "c1", campaignTitle: "Penang Food Fair", expiresAt: LIVE.ends_at,
      },
      error: null,
    });
  });

  it.each([
    ["a bad signature", seed(), `${token.slice(0, -10)}AAAAAAAAAA`],
    ["a revoked link", seed({ revoked_at: "2026-11-19T00:00:00Z" }), token],
    ["an ended event", seed({ promotion_campaigns: ENDED }), token],
    ["an unapproved vendor", seed({ vendors: { name: "X", status: "suspended" } }), token],
    ["no approved registration", seed({}, "withdrawn"), token],
    ["an unknown link", makeFakeDb({}).db, token],
  ])("returns no link for %s", async (_label, db, value) => {
    await expect(resolveActiveStaffLink(db, value, NOW)).resolves.toEqual({ link: null, error: null });
  });
});
