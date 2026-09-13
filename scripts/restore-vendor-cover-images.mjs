#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

const BUCKET = "vendor-images";
const EXTENSIONS = ["jpg", "jpeg", "png", "webp"];
const PENANG_SOURCE_BY_SLUG = new Map([
  ["cheong-fatt-tze-blue-mansion", "penang/cheong-fatt-tze-mansion.webp"],
  ["eastern-oriental-hotel", "penang/eastern-oriental-hotel.webp"],
  ["kek-lok-si-temple-vendor", "penang/kek-lok-si-temple.webp"],
  ["khoo-kongsi-trust", "penang/khoo-kongsi.webp"],
  ["penang-hill-corporation", "penang/penang-hill.webp"],
  ["pinang-peranakan-mansion-vendor", "penang/pinang-peranakan-mansion.webp"],
]);

function loadEnv() {
  for (const filename of [".env.local", ".env"]) {
    const filepath = path.resolve(process.cwd(), filename);
    if (!fs.existsSync(filepath)) continue;
    for (const line of fs.readFileSync(filepath, "utf8").split(/\r?\n/)) {
      const match = line.trim().match(/^([A-Z_][A-Z0-9_]*)\s*=\s*(.*)$/);
      if (match && !process.env[match[1]]) process.env[match[1]] = match[2].replace(/^['"]|['"]$/g, "");
    }
    break;
  }
}

function sourceCandidates(vendor) {
  const penangPath = PENANG_SOURCE_BY_SLUG.get(vendor.slug);
  return penangPath ? [penangPath] : EXTENSIONS.map((extension) => `vendor-images/${vendor.slug}.${extension}`);
}

async function listSourceIndex(supabase) {
  const [vendorImages, penangImages] = await Promise.all(["vendor-images", "penang"].map(async (prefix) => {
    const { data, error } = await supabase.storage.from(BUCKET).list(prefix, { limit: 1000, sortBy: { column: "name", order: "asc" } });
    if (error) throw error;
    return (data || []).filter((item) => /\.(?:jpe?g|png|webp)$/i.test(item.name)).map((item) => ({
      sourcePath: `${prefix}/${item.name}`,
      contentHash: item.metadata?.eTag?.replaceAll('"', "") || crypto.createHash("sha256").update(item.id || item.name).digest("hex"),
    }));
  }));
  return new Map([...vendorImages, ...penangImages].map((source) => [source.sourcePath, source]));
}

async function mapWithConcurrency(items, callback, concurrency = 12) {
  const results = new Array(items.length);
  let cursor = 0;
  async function worker() {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await callback(items[index]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, () => worker()));
  return results;
}

loadEnv();
if (process.env.VENDOR_COVER_RESTORE !== "1") {
  console.error("Refusing to update persisted vendor covers without VENDOR_COVER_RESTORE=1.");
  process.exit(1);
}

const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !serviceKey) throw new Error("Missing Supabase service credentials.");
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });

const { data: vendors, error: vendorError } = await supabase
  .from("vendors")
  .select("id,name,slug,cover_url")
  .eq("status", "approved")
  .order("name");
if (vendorError) throw vendorError;

const sourceIndex = await listSourceIndex(supabase);
const resolved = (vendors || []).map((vendor) => {
  const sourcePath = sourceCandidates(vendor).find((candidate) => sourceIndex.has(candidate));
  return sourcePath ? { vendor, sourcePath, contentHash: sourceIndex.get(sourcePath).contentHash } : null;
});
const sources = resolved.filter(Boolean);
const missing = (vendors || []).filter((vendor) => !sources.some((source) => source.vendor.id === vendor.id));
if (new Set(sources.map((source) => source.sourcePath)).size !== sources.length) throw new Error("Duplicate curated vendor image paths detected.");
if (new Set(sources.map((source) => source.contentHash)).size !== sources.length) throw new Error("Duplicate curated vendor image content detected.");

const missingLabel = missing.map((vendor) => `${vendor.slug} (${vendor.name})`).join(", ");
if (missing.length && process.env.VENDOR_COVER_RESTORE_ALLOW_PARTIAL !== "1") {
  throw new Error(`Missing curated vendor image paths for ${missing.length} approved vendors: ${missingLabel}`);
}
if (!sources.length) throw new Error("No curated vendor images were verified; refusing to modify covers.");

await mapWithConcurrency(sources, async ({ vendor, sourcePath }) => {
  const { error } = await supabase.from("vendors").update({ cover_url: sourcePath }).eq("id", vendor.id);
  if (error) throw error;
});

if (missing.length) {
  await mapWithConcurrency(missing.filter((vendor) => /^entities\/vendor\//.test(vendor.cover_url || "")), async (vendor) => {
    const { error } = await supabase.from("vendors").update({ cover_url: null }).eq("id", vendor.id);
    if (error) throw error;
  });
}

const { data: generatedVendorMedia, error: generatedMediaError } = await supabase
  .from("media_assets")
  .select("id")
  .like("url", "entities/vendor/%");
if (generatedMediaError) throw generatedMediaError;
for (let index = 0; index < (generatedVendorMedia?.length || 0); index += 200) {
  const { error } = await supabase.from("media_assets").delete().in("id", generatedVendorMedia.slice(index, index + 200).map((row) => row.id));
  if (error) throw error;
}

const { data: readback, error: readbackError } = await supabase.from("vendors").select("id,cover_url").eq("status", "approved");
if (readbackError) throw readbackError;
const coverById = new Map((readback || []).map((vendor) => [vendor.id, vendor.cover_url]));
const unmappedWrites = sources.filter(({ vendor, sourcePath }) => coverById.get(vendor.id) !== sourcePath);
const unresolvedArtwork = missing.filter((vendor) => /^entities\/vendor\//.test(coverById.get(vendor.id) || ""));
if (unmappedWrites.length || unresolvedArtwork.length) throw new Error("Vendor cover read-back did not match the verified source plan.");

console.log(JSON.stringify({
  approved_vendors: vendors?.length || 0,
  restored_verified_vendor_covers: sources.length,
  cleared_unverified_artwork_covers: missing.length,
  removed_generated_vendor_gallery_rows: generatedVendorMedia?.length || 0,
  missing_source_slugs: missing.map((vendor) => vendor.slug),
  unique_verified_source_content: true,
}, null, 2));
