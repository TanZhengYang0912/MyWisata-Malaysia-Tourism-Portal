import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const manifestPath = path.join(root, "public/assets/customer/products/product-image-manifest.json");
const creditsPath = path.join(root, "public/assets/customer/products/PHOTO-CREDITS.md");
const migrationPath = path.join(root, "supabase/migrations/20260817023927_seed_product_cover_images.sql");

describe.skip("product image curation contract", () => {
  it("contains one credited, unique local image for every curated product", () => {
    expect(existsSync(manifestPath)).toBe(true);
    expect(existsSync(creditsPath)).toBe(true);

    const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as {
      products: Array<{
        slug: string;
        asset_path: string;
        source_page: string;
        source_image_url: string;
        license: string;
        artist: string;
        sha256: string;
      }>;
    };

    expect(manifest.products).toHaveLength(293);
    expect(new Set(manifest.products.map((item) => item.slug)).size).toBe(293);
    expect(new Set(manifest.products.map((item) => item.asset_path)).size).toBe(293);
    expect(new Set(manifest.products.map((item) => item.source_page)).size).toBe(293);
    expect(new Set(manifest.products.map((item) => item.sha256)).size).toBe(293);

    for (const item of manifest.products) {
      expect(item.asset_path).toMatch(/^\/assets\/customer\/products\/[a-z0-9-]+\.(jpg|jpeg|png|webp)$/);
      expect(existsSync(path.join(root, "public", item.asset_path.replace(/^\//, "")))).toBe(true);
      expect(item.source_page).toMatch(/^https:\/\//);
      expect(item.source_image_url).toMatch(/^https:\/\//);
      expect(item.license.trim()).not.toBe("");
      expect(item.artist.trim()).not.toBe("");
    }
  });

  it("contains a slug-guarded update for every curated product", () => {
    expect(existsSync(migrationPath)).toBe(true);
    const migration = readFileSync(migrationPath, "utf8");
    expect(migration).toContain("BEGIN;");
    expect(migration).toContain("COMMIT;");
    expect(migration).toContain("cover_url");
    expect(migration.match(/WHERE slug = '/g)?.length).toBe(293);
    expect(migration).toContain("expected 293 active approved products with unique local cover paths");
  });
});
