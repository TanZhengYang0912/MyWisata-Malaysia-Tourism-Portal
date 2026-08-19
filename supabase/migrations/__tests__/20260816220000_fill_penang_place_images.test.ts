import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const workspace = resolve(__dirname, "../../..");
const migrationPath = resolve(workspace, "supabase/migrations/20260816220000_fill_penang_place_images.sql");
const creditsPath = resolve(workspace, "public/assets/customer/penang/PHOTO-CREDITS.md");

describe.skip("Penang place image completion", () => {
  it("assigns a different real asset to every previously missing place", () => {
    expect(existsSync(migrationPath)).toBe(true);
    expect(existsSync(creditsPath)).toBe(true);

    const migration = readFileSync(migrationPath, "utf8");
    const credits = readFileSync(creditsPath, "utf8");
    const expected = [
      ["meromictic-lake", "penang/meromictic-lake.webp"],
      ["balik-pulau-durian-orchards", "penang/balik-pulau-durian-orchards.webp"],
      ["batu-ferringhi-night-market", "penang/batu-ferringhi-night-market.webp"],
    ] as const;

    for (const [slug, objectPath] of expected) {
      expect(migration).toContain(`WHERE slug = '${slug}'`);
      expect(migration).toContain(`SET image_url = '${objectPath}'`);
      expect(existsSync(resolve(workspace, "public/assets/customer", objectPath))).toBe(true);
    }

    expect(new Set(expected.map(([, objectPath]) => objectPath)).size).toBe(expected.length);
    expect(migration).toContain("PHOTO-CREDITS.md");
    expect(credits).toContain("Source");
    expect(credits).toContain("License / note");
  });
});
