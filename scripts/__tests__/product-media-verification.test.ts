import { describe, expect, it } from "vitest";

import { validateProductMediaManifest } from "../lib/product-media-verification.mjs";

const root = process.cwd();
const validEntry = {
  slug: "real-product",
  asset_path: "/assets/customer/products/real-product.jpg",
  source_type: "commons",
  source_page: "https://commons.wikimedia.org/wiki/File:Real_product.jpg",
  source_image_url: "https://upload.wikimedia.org/wikipedia/commons/a/a1/Real_product.jpg",
  artist: "Photographer",
  license: "CC BY-SA 4.0",
  sha256: "a".repeat(64),
};

describe("product media provenance", () => {
  it("requires every active product to have a credited local asset", () => {
    const result = validateProductMediaManifest({
      products: [{ id: "product-1", slug: "real-product" }],
      manifest: [validEntry],
      projectRoot: root,
    });

    expect(result.allRequirementsPass).toBe(false);
    expect(result.issues).toContainEqual({
      code: "missing_local_asset",
      slug: "real-product",
      assetPath: "assets/customer/products/real-product.jpg",
    });
  });

  it("does not allow generated fallback unless explicitly enabled", () => {
    const result = validateProductMediaManifest({
      products: [],
      manifest: [{ ...validEntry, source_type: "generated" }],
      projectRoot: root,
    });

    expect(result.issues).toContainEqual({ code: "generated_fallback_not_allowed", slug: "real-product" });
  });

  it("rejects missing source evidence and duplicate hashes", () => {
    const result = validateProductMediaManifest({
      products: [],
      manifest: [
        { ...validEntry, slug: "one" },
        { ...validEntry, slug: "two", asset_path: "/assets/customer/products/two.jpg" },
      ],
      projectRoot: root,
    });

    expect(result.issues).toContainEqual({ code: "duplicate_content_hash", slug: "two" });
  });
});
