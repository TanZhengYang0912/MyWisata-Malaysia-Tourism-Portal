import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const manifestPath = resolve(process.cwd(), "scripts/data/verified-place-accesses.json");
const mediaPath = resolve(process.cwd(), "scripts/data/verified-place-activity-media.json");
const mediaManifest = JSON.parse(readFileSync(mediaPath, "utf8"));
const hasLocalAssets = mediaManifest.activities.every((item: { asset_path: string }) => existsSync(resolve(process.cwd(), "public/assets/customer", item.asset_path)));
const { buildVerifiedPlaceAccessPlan } = await import("../lib/verified-place-accesses.mjs");

describe.skipIf(!hasLocalAssets)("verified place access planner", () => {
  it("maps each source-backed manifest entry to one active POI without a vendor product", () => {
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
    const media = JSON.parse(readFileSync(mediaPath, "utf8"));
    const plan = buildVerifiedPlaceAccessPlan({
      manifest: { accesses: manifest.accesses.filter((access: { place_slug: string }) => access.place_slug === "dataran-merdeka") },
      places: [{ id: "place-1", slug: "dataran-merdeka", level: "poi", status: "active" }],
      media,
    });

    expect(plan.issues).toEqual([]);
    expect(plan.rows).toEqual(expect.arrayContaining([
      expect.objectContaining({
        place_id: "place-1",
        slug: "dataran-merdeka-public-access",
        access_type: "free_public_access",
        source_url: "https://www.malaysia.travel/explore/top-places-to-visit-in-kuala-lumpur",
      }),
      expect.objectContaining({ slug: "dataran-merdeka-sultan-abdul-samad-galleries", access_type: "free_activity" }),
      expect.objectContaining({ slug: "dataran-merdeka-heritage-walk", access_type: "free_activity" }),
    ]));
    expect(plan.rows[0]).not.toHaveProperty("vendor_id");
    expect(plan.rows[0]).not.toHaveProperty("outlet_id");
  });

  it("rejects missing sources, duplicate place access slugs, and non-POI targets", () => {
    const plan = buildVerifiedPlaceAccessPlan({
      manifest: {
        accesses: [
          { place_slug: "state", slug: "bad", title: "Bad", description: "Bad", access_type: "free_public_access", source_title: "Bad", source_url: "http://example.com" },
          { place_slug: "missing", slug: "bad", title: "Duplicate", description: "Duplicate", access_type: "free_activity", source_title: "", source_url: "" },
        ],
      },
      places: [{ id: "state-1", slug: "state", level: "state", status: "active" }],
      media: { activities: [] },
    });

    expect(plan.rows).toEqual([]);
    expect(plan.issues.map((issue: { code: string }) => issue.code)).toEqual(expect.arrayContaining([
      "duplicate_access_slug",
      "invalid_source_url",
      "place_not_active_poi",
      "place_not_found",
    ]));
  });

  it("keeps the documented three free Thean Hou activities tied to the real POI", () => {
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
    const media = JSON.parse(readFileSync(mediaPath, "utf8"));
    const plan = buildVerifiedPlaceAccessPlan({
      manifest: { accesses: manifest.accesses.filter((access: { place_slug: string }) => access.place_slug === "thean-hou-temple") },
      places: [{ id: "thean-hou-1", slug: "thean-hou-temple", level: "poi", status: "active" }],
      media,
    });

    expect(plan.issues).toEqual([]);
    expect(plan.rows).toHaveLength(3);
    expect(plan.rows.every((row: { access_type: string }) => ["free_public_access", "free_activity"].includes(row.access_type))).toBe(true);
  });

  it("marks the weekly Jonker Street night market as a free, no-booking activity", () => {
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
    const media = JSON.parse(readFileSync(mediaPath, "utf8"));
    const plan = buildVerifiedPlaceAccessPlan({
      manifest: { accesses: manifest.accesses.filter((access: { place_slug: string }) => access.place_slug === "jonker-street") },
      places: [{ id: "jonker-1", slug: "jonker-street", level: "poi", status: "active" }],
      media,
    });

    expect(plan.issues).toEqual([]);
    expect(plan.rows).toHaveLength(3);
    expect(plan.rows).toContainEqual(expect.objectContaining({ slug: "jonker-street-night-market-stroll", access_type: "free_activity" }));
  });

  it("preserves Putra Mosque's source-confirmed free entry and three visitor activities", () => {
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
    const media = JSON.parse(readFileSync(mediaPath, "utf8"));
    const plan = buildVerifiedPlaceAccessPlan({
      manifest: { accesses: manifest.accesses.filter((access: { place_slug: string }) => access.place_slug === "putra-mosque") },
      places: [{ id: "putra-mosque-1", slug: "putra-mosque", level: "poi", status: "active" }],
      media,
    });

    expect(plan.issues).toEqual([]);
    expect(plan.rows).toHaveLength(3);
    expect(plan.rows).toContainEqual(expect.objectContaining({ slug: "putra-mosque-public-entry", access_type: "free_public_access" }));
  });

  it("keeps National Mosque access free only because the source explicitly confirms it", () => {
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
    const media = JSON.parse(readFileSync(mediaPath, "utf8"));
    const plan = buildVerifiedPlaceAccessPlan({
      manifest: { accesses: manifest.accesses.filter((access: { place_slug: string }) => access.place_slug === "national-mosque-kuala-lumpur") },
      places: [{ id: "national-mosque-1", slug: "national-mosque-kuala-lumpur", level: "poi", status: "active" }],
      media,
    });

    expect(plan.issues).toEqual([]);
    expect(plan.rows).toHaveLength(3);
    expect(plan.rows).toContainEqual(expect.objectContaining({ slug: "national-mosque-public-entry", access_type: "free_public_access" }));
  });

  it("keeps Labuan War Cemetery access free only because Tourism Malaysia explicitly confirms free entry", () => {
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
    const media = JSON.parse(readFileSync(mediaPath, "utf8"));
    const plan = buildVerifiedPlaceAccessPlan({
      manifest: { accesses: manifest.accesses.filter((access: { place_slug: string }) => access.place_slug === "labuan-war-cemetery") },
      places: [{ id: "labuan-war-cemetery-1", slug: "labuan-war-cemetery", level: "poi", status: "active" }],
      media,
    });

    expect(plan.issues).toEqual([]);
    expect(plan.rows).toHaveLength(3);
    expect(plan.rows).toContainEqual(expect.objectContaining({ slug: "labuan-war-cemetery-public-entry", access_type: "free_public_access" }));
  });

  it("keeps Bukit Melawati's free access separate from its optional paid tram", () => {
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
    const media = JSON.parse(readFileSync(mediaPath, "utf8"));
    const plan = buildVerifiedPlaceAccessPlan({
      manifest: { accesses: manifest.accesses.filter((access: { place_slug: string }) => access.place_slug === "bukit-melawati") },
      places: [{ id: "bukit-melawati-1", slug: "bukit-melawati", level: "poi", status: "active" }],
      media,
    });

    expect(plan.issues).toEqual([]);
    expect(plan.rows).toHaveLength(3);
    expect(plan.rows).toContainEqual(expect.objectContaining({ slug: "bukit-melawati-public-entry", access_type: "free_public_access" }));
  });

  it("uses Blue Mosque free claims only where Tourism Malaysia explicitly provides them", () => {
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
    const media = JSON.parse(readFileSync(mediaPath, "utf8"));
    const plan = buildVerifiedPlaceAccessPlan({
      manifest: { accesses: manifest.accesses.filter((access: { place_slug: string }) => access.place_slug === "blue-mosque") },
      places: [{ id: "blue-mosque-1", slug: "blue-mosque", level: "poi", status: "active" }],
      media,
    });

    expect(plan.issues).toEqual([]);
    expect(plan.rows).toHaveLength(3);
    expect(plan.rows).toContainEqual(expect.objectContaining({ slug: "blue-mosque-public-entry", access_type: "free_public_access" }));
  });
});
