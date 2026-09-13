import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  buildVerifiedOfferRows,
  buildVerifiedProductRows,
  stableVerifiedProductUuid,
  validateVerifiedCatalogue,
} from "../lib/verified-vendor-catalogue.mjs";

const root = process.cwd();
const manifest = JSON.parse(fs.readFileSync(path.join(root, "scripts/data/verified-baba-house-products.json"), "utf8"));
const hasLocalAssets = manifest.products.every((product: { asset_path: string }) => fs.existsSync(path.resolve(root, "public", product.asset_path.replace(/^\//, ""))));

describe("verified vendor catalogue contract", () => {
  it.skipIf(!hasLocalAssets)("requires five source-backed products with local, unique assets", () => {
    const result = validateVerifiedCatalogue(manifest, { root });
    expect(result.allRequirementsPass).toBe(true);
    expect(result.issues).toEqual([]);
    expect(manifest.products).toHaveLength(5);
  });

  it("creates shared vendor products and one offer for every outlet", () => {
    const products = buildVerifiedProductRows(manifest);
    const offers = buildVerifiedOfferRows(manifest, products);
    expect(products.every((product: { outlet_id: string | null }) => product.outlet_id === null)).toBe(true);
    expect(offers).toHaveLength(manifest.outlets.length * manifest.products.length);
    expect(new Set(offers.map((offer: { outlet_id: string }) => offer.outlet_id)).size).toBe(manifest.outlets.length);
    expect(stableVerifiedProductUuid(manifest.vendor.id, manifest.products[0].slug)).toBe(products[0].id);
  });

  it("requires auditable price, image, and attribution evidence", () => {
    expect(manifest.products.every((product: { price_reference_page?: string; observed_at: string; artist: string; license: string }) => (
      /^https:\/\//.test(product.price_reference_page ?? "")
      && Boolean(product.observed_at)
      && Boolean(product.artist)
      && Boolean(product.license)
    ))).toBe(true);
  });

  it.skipIf(!hasLocalAssets)("rejects duplicated assets and missing price observations", () => {
    const invalid = structuredClone(manifest);
    invalid.products[1].asset_path = invalid.products[0].asset_path;
    invalid.products[1].sha256 = invalid.products[0].sha256;
    invalid.products[2].observed_at = "";
    const result = validateVerifiedCatalogue(invalid, { root });
    expect(result.allRequirementsPass).toBe(false);
    expect(result.issues.some((issue) => issue.includes("duplicate image content"))).toBe(true);
    expect(result.issues.some((issue) => issue.includes("observation date"))).toBe(true);
  });
});
