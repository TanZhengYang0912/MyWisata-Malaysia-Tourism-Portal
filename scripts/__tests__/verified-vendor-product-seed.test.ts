import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const root = process.cwd();
const dataPath = path.join(root, "scripts/data/verified-vendor-products.json");
const scriptPath = path.join(root, "scripts/seed-verified-vendor-products.mjs");
const gheeDataPath = path.join(root, "scripts/data/verified-ghee-hiang-products.json");
const gheeSyncPath = path.join(root, "scripts/sync-verified-ghee-product-media.mjs");

describe("verified vendor product seed", () => {
  it("keeps a source-backed product batch explicit and duplicate-free", () => {
    const data = JSON.parse(fs.readFileSync(dataPath, "utf8")) as {
      vendor: { name: string; source_page: string; price_reference_page: string };
      outlets: { id: string; name: string }[];
      products: { slug: string; name: string; asset_path: string; source_type: string; source_page: string; source_image_url: string; sha256: string }[];
    };
    expect(data.vendor.name).toBe("Penang Road Famous Teochew Chendul");
    expect(data.vendor.source_page).toMatch(/^https:\/\//);
    expect(data.vendor.price_reference_page).toMatch(/^https:\/\//);
    expect(data.outlets).toHaveLength(4);
    expect(new Set(data.outlets.map((outlet) => outlet.id)).size).toBe(data.outlets.length);
    expect(new Set(data.products.map((product) => product.slug)).size).toBe(data.products.length);
    expect(data.products.every((product) => /^\/assets\/customer\/products\//.test(product.asset_path))).toBe(true);
    expect(data.products.every((product) => product.source_type === "official" && /^https:\/\//.test(product.source_page) && /^https:\/\//.test(product.source_image_url))).toBe(true);
    expect(data.products.every((product) => /^[a-f0-9]{64}$/.test(product.sha256))).toBe(true);
  });

  it("requires an explicit write guard and persists shared offers", () => {
    const source = fs.readFileSync(scriptPath, "utf8");
    expect(source).toContain('VERIFIED_VENDOR_PRODUCT_SEED !== "1"');
    expect(source).toContain('upsertRows(supabase, "outlet_offers"');
    expect(source).toContain('"product_id,outlet_id"');
    expect(source).toContain("outlet_id: null");
  });

  it("maps every Ghee Hiang product to its own source-backed asset", () => {
    const data = JSON.parse(fs.readFileSync(gheeDataPath, "utf8")) as {
      products: { slug: string; asset_path: string; source_type: string; source_page: string; source_image_url: string; sha256: string }[];
    };
    expect(data.products).toHaveLength(6);
    expect(new Set(data.products.map((product) => product.asset_path)).size).toBe(data.products.length);
    expect(new Set(data.products.map((product) => product.sha256)).size).toBe(data.products.length);
    expect(data.products.every((product) => product.source_type === "official" && /^https:\/\//.test(product.source_page) && /^https:\/\//.test(product.source_image_url))).toBe(true);
    expect(fs.readFileSync(gheeSyncPath, "utf8")).toContain('update({ cover_url: filename })');
  });
});
