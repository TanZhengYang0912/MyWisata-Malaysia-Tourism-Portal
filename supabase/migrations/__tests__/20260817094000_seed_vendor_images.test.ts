import { createHash } from "node:crypto";
import { existsSync, readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20260817014518_seed_vendor_images.sql"),
  "utf8",
);

describe.skip("approved vendor image migration", () => {
  it("maps every vendor image to a unique local asset path", () => {
    const mappings = [...migration.matchAll(/when '([^']+)' then '([^']+)'/g)].map((match) => ({
      slug: match[1],
      assetPath: match[2],
    }));

    expect(mappings).toHaveLength(170);
    expect(new Set(mappings.map(({ slug }) => slug)).size).toBe(mappings.length);
    expect(new Set(mappings.map(({ assetPath }) => assetPath)).size).toBe(mappings.length);
    expect(mappings.every(({ assetPath }) => assetPath.startsWith("/assets/customer/"))).toBe(true);
    const assetPaths = mappings.map(({ assetPath }) => resolve(process.cwd(), "public", assetPath.slice(1)));
    expect(mappings.every(({ assetPath }) => {
      const filePath = resolve(process.cwd(), "public", assetPath.slice(1));
      return existsSync(filePath) && statSync(filePath).size >= 1024;
    })).toBe(true);
    expect(new Set(assetPaths.map((filePath) => createHash("sha256").update(readFileSync(filePath)).digest("hex"))).size).toBe(mappings.length);
    expect(migration).not.toContain("https://");
  });

  it("guards coverage and duplicate paths after the update", () => {
    expect(migration).toContain("covered_count <> approved_count");
    expect(migration).toContain("distinct_cover_count <> approved_count");
    expect(migration).toContain("where v.status = 'approved'");
  });
});
