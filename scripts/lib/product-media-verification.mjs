import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const HTTPS_SOURCES = new Set(["official", "commons", "marketplace", "generated"]);

/**
 * @typedef {{id: string, slug: string}} ProductMediaProduct
 * @typedef {{slug: string, asset_path: string, source_type: string, source_page: string, source_image_url: string, artist: string, license: string, sha256: string}} ProductMediaManifestEntry
 */

function validHttps(value) {
  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
}

function validSha256(value) {
  return /^[a-f0-9]{64}$/i.test(String(value ?? ""));
}

function normalizeAssetPath(value) {
  const raw = String(value ?? "").trim();
  if (!raw.startsWith("/assets/customer/products/")) return null;
  const relative = raw.slice(1);
  if (relative.includes("..")) return null;
  return relative;
}

/**
 * Validate the checked-in photo manifest before a product seed runs.
 * `source_type` is internal provenance metadata and is intentionally not a
 * customer-facing label. Generated assets are accepted only when the caller
 * explicitly enables the final fallback.
 *
 * @param {{products?: ProductMediaProduct[], manifest?: ProductMediaManifestEntry[], projectRoot?: string, allowGeneratedFallback?: boolean}} options
 */
export function validateProductMediaManifest({
  products = [],
  manifest = [],
  projectRoot = process.cwd(),
  allowGeneratedFallback = false,
} = {}) {
  const issues = [];
  const bySlug = new Map();
  const usedAssets = new Set();
  const usedHashes = new Set();

  for (const entry of manifest) {
    if (bySlug.has(entry.slug)) issues.push({ code: "duplicate_manifest_slug", slug: entry.slug });
    bySlug.set(entry.slug, entry);
    const assetPath = normalizeAssetPath(entry.asset_path);
    if (!assetPath) issues.push({ code: "invalid_asset_path", slug: entry.slug });
    else {
      if (usedAssets.has(assetPath)) issues.push({ code: "duplicate_asset_path", slug: entry.slug, assetPath });
      usedAssets.add(assetPath);
      const projectAsset = path.resolve(projectRoot, assetPath);
      const publicAsset = path.resolve(projectRoot, "public", assetPath);
      if (!fs.existsSync(projectAsset) && !fs.existsSync(publicAsset)) {
        issues.push({ code: "missing_local_asset", slug: entry.slug, assetPath });
      }
    }
    if (!HTTPS_SOURCES.has(entry.source_type)) {
      issues.push({ code: "invalid_source_type", slug: entry.slug });
    }
    if (entry.source_type === "generated" && !allowGeneratedFallback) {
      issues.push({ code: "generated_fallback_not_allowed", slug: entry.slug });
    }
    if (!validHttps(entry.source_page)) issues.push({ code: "invalid_source_page", slug: entry.slug });
    if (!validHttps(entry.source_image_url)) issues.push({ code: "invalid_source_image_url", slug: entry.slug });
    if (!String(entry.artist ?? "").trim()) issues.push({ code: "missing_artist", slug: entry.slug });
    if (!String(entry.license ?? "").trim()) issues.push({ code: "missing_license", slug: entry.slug });
    if (!validSha256(entry.sha256)) issues.push({ code: "invalid_sha256", slug: entry.slug });
    else {
      if (usedHashes.has(entry.sha256)) issues.push({ code: "duplicate_content_hash", slug: entry.slug });
      usedHashes.add(entry.sha256);
    }
  }

  for (const product of products) {
    const entry = bySlug.get(product.slug);
    if (!entry) {
      issues.push({ code: "missing_product_manifest", productId: product.id, slug: product.slug });
    }
  }

  return {
    productCount: products.length,
    manifestCount: manifest.length,
    issues,
    allRequirementsPass: issues.length === 0 && manifest.length >= products.length,
  };
}

export function sha256File(filepath) {
  return crypto.createHash("sha256").update(fs.readFileSync(filepath)).digest("hex");
}
