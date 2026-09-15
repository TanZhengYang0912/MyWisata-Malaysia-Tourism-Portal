import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const root = process.cwd();

describe("verified vendor catalogue progress report", () => {
  it("discovers checked-in source manifests without treating legacy seed rows as evidence", () => {
    const files = fs.readdirSync(path.join(root, "scripts/data")).filter((file) => /^verified-.*-products\.json$/.test(file));
    expect(files).toEqual([
      "verified-baba-house-products.json",
      "verified-blue-mansion-products.json",
      "verified-cameron-valley-tea-products.json",
      "verified-desa-murni-batik-products.json",
      "verified-entopia-products.json",
      "verified-escape-penang-products.json",
      "verified-gerakbudaya-bookshop-products.json",
      "verified-ghee-hiang-products.json",
      "verified-habitat-products.json",
      "verified-hameediyah-products.json",
      "verified-hiap-joo-bakery-products.json",
      "verified-highlands-skyway-products.json",
      "verified-jonker-88-products.json",
      "verified-langkawi-cable-car-products.json",
      "verified-legoland-hotel-products.json",
      "verified-legoland-malaysia-products.json",
      "verified-lost-world-products.json",
      "verified-mari-mari-cultural-village-products.json",
      "verified-melaka-river-cruise-products.json",
      "verified-menara-alor-setar-products.json",
      "verified-menara-taming-sari-products.json",
      "verified-nasi-kandar-yasmeen-products.json",
      "verified-pelangi-beach-resort-products.json",
      "verified-penang-hill-products.json",
      "verified-petronas-twin-towers-products.json",
      "verified-taman-negara-products.json",
      "verified-taman-tamadun-islam-products.json",
      "verified-tanoti-workshop-products.json",
      "verified-tropical-spice-garden-products.json",
      "verified-underwater-world-products.json",
      "verified-vendor-products.json",
    ]);
    expect(fs.readFileSync(path.join(root, "scripts/verify-verified-vendor-catalogue.mjs"), "utf8"))
      .toContain('readAll(supabase, "product_source_evidence"');
    expect(fs.existsSync(path.join(root, "scripts/data/verified-vendor-product-source-index.json"))).toBe(true);
  });
});
