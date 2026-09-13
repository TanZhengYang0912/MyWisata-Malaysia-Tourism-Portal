import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const mediaPath = resolve(process.cwd(), "scripts/data/verified-place-activity-media.json");
const accessPath = resolve(process.cwd(), "scripts/data/verified-place-accesses.json");
const informationalPath = resolve(process.cwd(), "scripts/data/verified-place-informational-activities.json");
const mediaManifest = JSON.parse(readFileSync(mediaPath, "utf8"));
const hasLocalAssets = mediaManifest.activities.every((item: { asset_path: string }) => existsSync(resolve(process.cwd(), "public/assets/customer", item.asset_path)));
const { buildVerifiedPlaceActivityMediaIndex } = await import("../lib/verified-place-activity-media.mjs");

describe.skipIf(!hasLocalAssets)("verified place activity media", () => {
  it("requires a distinct, licensed Storage asset for every curated activity", () => {
    const media = JSON.parse(readFileSync(mediaPath, "utf8"));
    const result = buildVerifiedPlaceActivityMediaIndex({ media });

    expect(result.issues).toEqual([]);
    expect(result.byKey.size).toBe(media.activities.length);
    expect(new Set([...result.byKey.values()].map((item) => item.asset_path)).size).toBe(media.activities.length);
    expect(new Set([...result.byKey.values()].map((item) => item.sha256)).size).toBe(media.activities.length);
  });

  it("maps every approved free or informational activity to exactly one unique asset", () => {
    const media = JSON.parse(readFileSync(mediaPath, "utf8"));
    const access = JSON.parse(readFileSync(accessPath, "utf8"));
    const informational = JSON.parse(readFileSync(informationalPath, "utf8"));
    const result = buildVerifiedPlaceActivityMediaIndex({ media });

    const expected = [
      ...access.accesses.map((item: { slug: string }) => `access:${item.slug}`),
      ...informational.activities.map((item: { slug: string }) => `informational:${item.slug}`),
    ];
    expect(new Set(expected).size).toBe(expected.length);
    expect(result.byKey.size).toBe(expected.length);
    expect(expected.every((key) => result.byKey.has(key))).toBe(true);
  });
});
