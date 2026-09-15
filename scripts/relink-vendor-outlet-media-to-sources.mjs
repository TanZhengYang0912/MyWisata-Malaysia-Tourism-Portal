#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

const ROOT = process.cwd();
const MANIFEST_PATH = path.resolve(ROOT, "public/assets/customer/vendor-images/entity-media-manifest-v4.json");

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

async function readAll(supabase, table, select) {
  const rows = [];
  for (let start = 0; ; start += 1000) {
    const { data, error } = await supabase.from(table).select(select).range(start, start + 999);
    if (error) throw new Error(`${table} read failed: ${error.message}`);
    rows.push(...(data ?? []));
    if ((data ?? []).length < 1000) return rows;
  }
}

async function updateInBatches(rows, update) {
  for (let start = 0; start < rows.length; start += 24) {
    const batch = rows.slice(start, start + 24);
    const results = await Promise.all(batch.map(async (row) => {
      for (let attempt = 0; attempt < 3; attempt += 1) {
        try {
          await update(row);
          return;
        } catch (error) {
          if (attempt === 2) throw error;
          await new Promise((resolve) => setTimeout(resolve, 250 * (attempt + 1)));
        }
      }
    }));
    void results;
    console.log(`Relinked media ${Math.min(start + batch.length, rows.length)}/${rows.length}`);
  }
}

async function upsertInChunks(supabase, rows) {
  for (let start = 0; start < rows.length; start += 250) {
    const { error } = await supabase.from("media_assets").upsert(rows.slice(start, start + 250), { onConflict: "id" });
    if (error) throw error;
    console.log(`Relinked media ${Math.min(start + 250, rows.length)}/${rows.length}`);
  }
}

loadEnv();
if (process.env.VENDOR_OUTLET_MEDIA_SOURCE_RELINK !== "1") {
  console.error("Refusing source media relink without VENDOR_OUTLET_MEDIA_SOURCE_RELINK=1.");
  process.exit(1);
}
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !serviceKey) throw new Error("Missing Supabase environment.");

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });
const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, "utf8"));
const [vendors, outlets, media] = await Promise.all([
  readAll(supabase, "vendors", "id,slug,logo_url"),
  readAll(supabase, "outlets", "id,vendor_id,name"),
  readAll(supabase, "media_assets", "id,vendor_id,outlet_id,url,alt_text,media_type,sort_order"),
]);
const vendorBySlug = new Map(vendors.map((row) => [row.slug, row]));
const outletByKey = new Map(outlets.map((row) => [`${row.vendor_id}:${row.name}`, row]));
const mediaByEntity = new Map(media.map((row) => [
  `${row.vendor_id}:${row.outlet_id ?? "vendor"}:${row.sort_order}`,
  row,
]));
const galleryUpdates = [];
const logoFallbacks = [];

for (const entry of manifest.vendors) {
  const vendor = vendorBySlug.get(entry.slug);
  if (!vendor) throw new Error(`Missing vendor for ${entry.slug}`);
  for (const [index, image] of entry.gallery.entries()) {
    const row = mediaByEntity.get(`${vendor.id}:vendor:${index}`);
    if (!row) throw new Error(`Missing vendor gallery row for ${entry.slug} #${index + 1}`);
    galleryUpdates.push({ row, url: image.sourceImageUrl, alt_text: image.alt });
  }
  logoFallbacks.push({ vendor, url: entry.gallery[0].sourceImageUrl });
}

for (const entry of manifest.outlets) {
  const vendor = vendorBySlug.get(entry.vendorSlug);
  const outlet = vendor && outletByKey.get(`${vendor.id}:${entry.outletName}`);
  if (!outlet) throw new Error(`Missing outlet for ${entry.outletName}`);
  for (const [index, image] of entry.gallery.entries()) {
    const row = mediaByEntity.get(`${vendor.id}:${outlet.id}:${index}`);
    if (!row) throw new Error(`Missing outlet gallery row for ${entry.outletName} #${index + 1}`);
    galleryUpdates.push({ row, url: image.sourceImageUrl, alt_text: image.alt });
  }
  logoFallbacks.push({ outlet, vendor, url: entry.gallery[0].sourceImageUrl });
}

await upsertInChunks(supabase, galleryUpdates.map(({ row, url, alt_text }) => ({
  id: row.id,
  vendor_id: row.vendor_id,
  outlet_id: row.outlet_id,
  product_id: row.product_id,
  url,
  alt_text,
  media_type: row.media_type,
  sort_order: row.sort_order,
})));

// The source manifest has no recoverable logo asset for these legacy rows.
// Use the first verified real gallery photo as the public fallback instead of
// keeping an image URL that returns an error.
const logoUpdates = logoFallbacks;

await updateInBatches(logoUpdates, async (fallback) => {
  if (fallback.outlet) {
    const row = media.find((candidate) => candidate.outlet_id === fallback.outlet.id && candidate.sort_order === -1);
    if (!row) throw new Error(`Missing outlet logo row for ${fallback.outlet.id}`);
    const { error } = await supabase.from("media_assets").update({ url: fallback.url, alt_text: `${fallback.outlet.name} photo` }).eq("id", row.id);
    if (error) throw error;
    return;
  }
  const { error } = await supabase.from("vendors").update({ logo_url: fallback.url }).eq("id", fallback.vendor.id);
  if (error) throw error;
  const row = media.find((candidate) => candidate.vendor_id === fallback.vendor.id && candidate.outlet_id === null && candidate.sort_order === -1);
  if (row) {
    const { error: mediaError } = await supabase.from("media_assets").update({ url: fallback.url, alt_text: `${fallback.vendor.slug} photo` }).eq("id", row.id);
    if (mediaError) throw mediaError;
  }
});

console.log(JSON.stringify({
  vendors: manifest.vendors.length,
  outlets: manifest.outlets.length,
  galleryUpdates: galleryUpdates.length,
  logoFallbacks: logoUpdates.length,
}, null, 2));
