import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const manifestPath = resolve(process.cwd(), "scripts/data/verified-place-informational-activities.json");
const activityMediaPath = resolve(process.cwd(), "scripts/data/verified-place-activity-media.json");
const mediaManifest = JSON.parse(readFileSync(activityMediaPath, "utf8"));
const hasLocalAssets = mediaManifest.activities.every((item: { asset_path: string }) => existsSync(resolve(process.cwd(), "public/assets/customer", item.asset_path)));
const { buildVerifiedPlaceInformationalActivityPlan } = await import("../lib/verified-place-informational-activities.mjs");

describe.skipIf(!hasLocalAssets)("verified place informational activity planner", () => {
  it("maps official attraction information to its POI without manufacturing commerce", () => {
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
    const media = JSON.parse(readFileSync(activityMediaPath, "utf8"));
    const activities = manifest.activities.filter((activity: { place_slug: string }) => activity.place_slug === "petronas-twin-towers");
    const plan = buildVerifiedPlaceInformationalActivityPlan({
      manifest: { activities },
      places: [{ id: "petronas-1", slug: "petronas-twin-towers", level: "poi", status: "active" }],
      media,
    });

    expect(plan.issues).toEqual([]);
    expect(plan.rows).toEqual(expect.arrayContaining([
      expect.objectContaining({
        place_id: "petronas-1",
        slug: "petronas-twin-towers-skybridge",
        activity_type: "informational_paid_activity",
        source_url: "https://www.malaysia.travel/explore/petronas-twin-tower",
      }),
    ]));
    expect(plan.rows[0]).not.toHaveProperty("vendor_id");
    expect(plan.rows[0]).not.toHaveProperty("outlet_id");
  });

  it("rejects missing sources, invalid paid labels, duplicate slugs, and non-POI targets", () => {
    const plan = buildVerifiedPlaceInformationalActivityPlan({
      manifest: {
        activities: [
          { place_slug: "state", slug: "bad", title: "Bad", description: "Bad", activity_type: "informational_paid_activity", price_label: "", source_title: "Bad", source_url: "http://example.com" },
          { place_slug: "missing", slug: "bad", title: "Duplicate", description: "Duplicate", activity_type: "informational_paid_activity", price_label: "Ticket required", source_title: "", source_url: "" },
        ],
      },
      places: [{ id: "state-1", slug: "state", level: "state", status: "active" }],
      media: { activities: [] },
    });

    expect(plan.rows).toEqual([]);
    expect(plan.issues.map((issue: { code: string }) => issue.code)).toEqual(expect.arrayContaining([
      "duplicate_activity_slug",
      "invalid_source_url",
      "missing_price_label",
      "place_not_active_poi",
      "place_not_found",
    ]));
  });

  it("keeps the full information catalogue non-commerce while requiring one unique image per activity", () => {
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
    const media = JSON.parse(readFileSync(activityMediaPath, "utf8"));
    const supportedSlugs = [...new Set(manifest.activities.map((activity: { place_slug: string }) => activity.place_slug))];
    const plan = buildVerifiedPlaceInformationalActivityPlan({
      manifest: { activities: manifest.activities.filter((activity: { place_slug: string }) => supportedSlugs.includes(activity.place_slug)) },
      places: supportedSlugs.map((slug) => ({ id: `${slug}-id`, slug, level: "poi", status: "active" })),
      media,
    });

    expect(plan.issues).toEqual([]);
    expect(plan.rows).toHaveLength(manifest.activities.length);
    expect(new Set(plan.rows.map((row: { image_path: string }) => row.image_path)).size).toBe(manifest.activities.length);
    expect(plan.rows.some((row) => "vendor_id" in row || "outlet_id" in row)).toBe(false);
  });

  it("keeps Labuan historical entries informational instead of inventing a supplier or checkout", () => {
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
    const media = JSON.parse(readFileSync(activityMediaPath, "utf8"));
    const activities = manifest.activities.filter((activity: { place_slug: string }) => activity.place_slug === "chimney-museum-labuan");
    const plan = buildVerifiedPlaceInformationalActivityPlan({
      manifest: { activities },
      places: [{ id: "labuan-chimney-1", slug: "chimney-museum-labuan", level: "poi", status: "active" }],
      media,
    });

    expect(plan.issues).toEqual([]);
    expect(plan.rows).toHaveLength(3);
    expect(plan.rows.every((row: { activity_type: string }) => row.activity_type === "informational_activity")).toBe(true);
  });
});
