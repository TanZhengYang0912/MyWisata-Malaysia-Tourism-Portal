import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const ASSET_PREFIX = "activity-media/";
const ALLOWED_LICENSE = /^(CC0(?: [0-9.]+)?|CC BY(?:-SA)?(?: [0-9.]+)?|Public domain|Official operator media; source attribution recorded)/i;

function validHttps(value) {
  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
}

function mediaKey(kind, slug) {
  return `${kind}:${slug}`;
}

/**
 * Validates media provenance before a seed can point a public activity at it.
 * The public card only receives the bucket-relative asset path; source URLs
 * remain in the checked-in audit manifest and are never customer links.
 */
export function buildVerifiedPlaceActivityMediaIndex({ media, root = process.cwd() }) {
  const issues = [];
  const byKey = new Map();
  const seenAssetPaths = new Set();
  const seenHashes = new Set();

  for (const item of media?.activities ?? []) {
    const key = mediaKey(item.kind, item.slug);
    let valid = true;
    if (!["access", "informational"].includes(item.kind) || !/^[a-z0-9-]+$/.test(item.slug ?? "")) {
      issues.push({ code: "invalid_media_identity", key });
      valid = false;
    }
    if (byKey.has(key)) {
      issues.push({ code: "duplicate_media_activity", key });
      valid = false;
    }
    if (!new RegExp(`^${ASSET_PREFIX}[a-z0-9-]+\\.webp$`).test(item.asset_path ?? "")) {
      issues.push({ code: "invalid_media_asset_path", key });
      valid = false;
    }
    if (!validHttps(item.source_page) || !validHttps(item.source_image_url)) {
      issues.push({ code: "invalid_media_source", key });
      valid = false;
    }
    if (!ALLOWED_LICENSE.test(item.license ?? "") || !String(item.artist ?? "").trim()) {
      issues.push({ code: "invalid_media_attribution", key });
      valid = false;
    }
    if (!/^[a-f0-9]{64}$/.test(item.sha256 ?? "")) {
      issues.push({ code: "invalid_media_hash", key });
      valid = false;
    }
    if (seenAssetPaths.has(item.asset_path)) {
      issues.push({ code: "duplicate_media_asset_path", key });
      valid = false;
    }
    if (seenHashes.has(item.sha256)) {
      issues.push({ code: "duplicate_media_hash", key });
      valid = false;
    }
    const absolutePath = path.resolve(root, "public/assets/customer", item.asset_path ?? "");
    if (!fs.existsSync(absolutePath)) {
      issues.push({ code: "missing_media_asset", key });
      valid = false;
    } else {
      const actualHash = crypto.createHash("sha256").update(fs.readFileSync(absolutePath)).digest("hex");
      if (actualHash !== item.sha256) {
        issues.push({ code: "media_hash_mismatch", key });
        valid = false;
      }
    }
    seenAssetPaths.add(item.asset_path);
    seenHashes.add(item.sha256);
    if (valid) byKey.set(key, item);
  }

  return { byKey, issues, mediaKey };
}
