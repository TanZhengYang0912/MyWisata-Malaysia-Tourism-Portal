#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

const ROOT = process.cwd();
const DATA_PATH = path.resolve(ROOT, "scripts/data/verified-vendor-entity-media.json");
const BUCKET = "vendor-images";

function loadEnv() {
  for (const filename of [".env.local", ".env"]) {
    const filepath = path.resolve(ROOT, filename);
    if (!fs.existsSync(filepath)) continue;
    for (const line of fs.readFileSync(filepath, "utf8").split(/\r?\n/)) {
      const match = line.trim().match(/^([A-Z_][A-Z0-9_]*)\s*=\s*(.*)$/);
      if (match && !process.env[match[1]]) process.env[match[1]] = match[2].replace(/^['"]|['"]$/g, "");
    }
    break;
  }
}

loadEnv();
if (process.env.VERIFIED_VENDOR_ENTITY_MEDIA !== "1") {
  console.error("Refusing remote vendor media writes without VERIFIED_VENDOR_ENTITY_MEDIA=1.");
  process.exit(1);
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
if (!url || !serviceKey) throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or service role key.");

const data = JSON.parse(fs.readFileSync(DATA_PATH, "utf8"));
const hashes = new Set();
const prepared = data.gallery.map((entry) => {
  if (!entry.source_page && !data.vendor.source_page) throw new Error("Missing official source page.");
  if (!entry.source_image_url.startsWith("https://")) throw new Error(`Invalid source image URL: ${entry.object_path}`);
  if (!entry.artist?.trim() || !entry.license?.trim()) throw new Error(`Missing attribution: ${entry.object_path}`);
  const asset = path.resolve(ROOT, "public", entry.asset_path.replace(/^\//, ""));
  if (!asset.startsWith(path.resolve(ROOT, "public") + path.sep) || !fs.existsSync(asset)) throw new Error(`Missing local asset: ${entry.asset_path}`);
  const body = fs.readFileSync(asset);
  const contentHash = crypto.createHash("sha256").update(body).digest("hex");
  if (contentHash !== entry.sha256) throw new Error(`SHA-256 mismatch: ${entry.object_path}`);
  if (hashes.has(contentHash)) throw new Error(`Duplicate source image content: ${entry.object_path}`);
  hashes.add(contentHash);
  if (!/^curated-v\d+\/vendor\/[^/]+\/gallery-\d+\.(?:png|jpe?g|webp)$/.test(entry.object_path)) throw new Error(`Invalid object path: ${entry.object_path}`);
  return { ...entry, body, contentHash };
});

const supabase = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });
const { data: vendor, error: vendorError } = await supabase
  .from("vendors")
  .select("id,name,status")
  .eq("id", data.vendor.id)
  .maybeSingle();
if (vendorError) throw new Error(`Vendor read failed: ${vendorError.message}`);
if (!vendor || vendor.name !== data.vendor.name || vendor.status !== "approved") throw new Error("Vendor identity/status does not match the verified manifest.");

const { data: existing, error: existingError } = await supabase
  .from("media_assets")
  .select("id,url")
  .eq("vendor_id", vendor.id)
  .is("outlet_id", null)
  .is("product_id", null)
  .gte("sort_order", 0);
if (existingError) throw new Error(`Vendor gallery read failed: ${existingError.message}`);
if ((existing ?? []).length > 0) throw new Error(`Refusing to overwrite existing vendor gallery rows for ${vendor.name}.`);

for (const entry of prepared) {
  const { error: uploadError } = await supabase.storage.from(BUCKET).upload(entry.object_path, entry.body, {
    contentType: "image/png",
    cacheControl: "31536000",
    upsert: true,
  });
  if (uploadError) throw new Error(`Vendor media upload failed for ${entry.object_path}: ${uploadError.message}`);
}

const { error: insertError } = await supabase.from("media_assets").insert(prepared.map((entry, index) => ({
  vendor_id: vendor.id,
  outlet_id: null,
  product_id: null,
  url: entry.object_path,
  alt_text: entry.alt,
  media_type: "image",
  sort_order: index,
})));
if (insertError) throw new Error(`Vendor gallery insert failed: ${insertError.message}`);

console.log(JSON.stringify({
  message: "Verified vendor gallery media synced",
  vendor: vendor.name,
  gallery: prepared.length,
  unique_content_hashes: new Set(prepared.map((entry) => entry.contentHash)).size === prepared.length,
  source: data.vendor.source_page,
}, null, 2));
