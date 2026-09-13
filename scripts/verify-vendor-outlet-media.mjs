#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

const SCOPE_PATH = path.resolve(process.cwd(), "scripts/data/enabled-commerce-outlet-scope.json");

function loadEnv() {
  for (const filename of [".env.local", ".env"]) {
    const filepath = path.resolve(process.cwd(), filename);
    if (!fs.existsSync(filepath)) continue;
    for (const line of fs.readFileSync(filepath, "utf8").split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const match = trimmed.match(/^([A-Z_][A-Z0-9_]*)\s*=\s*(.*)$/);
      if (match && !process.env[match[1]]) process.env[match[1]] = match[2].replace(/^['"]|['"]$/g, "");
    }
    break;
  }
}

loadEnv();
const scope = JSON.parse(fs.readFileSync(SCOPE_PATH, "utf8"));
const sourceManifestPath = path.resolve(process.cwd(), "public/assets/customer/vendor-images/entity-media-manifest-v4.json");
const sourceManifest = JSON.parse(fs.readFileSync(sourceManifestPath, "utf8"));
const sourceByUrl = new Map([...sourceManifest.vendors, ...sourceManifest.outlets].flatMap((entry) => entry.gallery).map((image) => [image.sourceImageUrl, image]));
const enabledOutletIds = new Set(scope.outlets.map((row) => row.id));
const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !key) throw new Error("Missing Supabase environment.");
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, key, { auth: { autoRefreshToken: false, persistSession: false } });
async function fetchAllMedia() {
  const rows = [];
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await supabase.from("media_assets").select("id,vendor_id,outlet_id,product_id,url,media_type,sort_order").range(offset, offset + 999);
    if (error) throw error;
    rows.push(...(data || []));
    if (!data || data.length < 1000) return rows;
  }
}

const [{ data: allVendors, error: vendorError }, { data: allOutlets, error: outletError }, mediaResult] = await Promise.all([
  supabase.from("vendors").select("id,logo_url,cover_url").eq("status", "approved"),
  supabase.from("outlets").select("id,vendor_id"),
  fetchAllMedia(),
]);
if (vendorError || outletError) throw vendorError || outletError;
const enabledVendorIds = new Set(scope.outlets.map((row) => row.vendor_id));
const vendors = (allVendors || []).filter((row) => enabledVendorIds.has(row.id));
const approvedVendorIds = new Set(vendors.map((row) => row.id));
const outlets = (allOutlets || []).filter((row) => enabledOutletIds.has(row.id) && approvedVendorIds.has(row.vendor_id));
const media = mediaResult;
const entityMedia = (media || []).filter((row) => row.product_id === null && (/^https?:\/\//.test(row.url || "") || /^entities\/(?:vendor|outlet)\//.test(row.url || "") || /^curated-v\d+\/(?:vendor|outlet)\//.test(row.url || "")));
const vendorIds = new Set((vendors || []).map((row) => row.id));
const outletIds = new Set((outlets || []).map((row) => row.id));
const gallery = entityMedia.filter((row) => (row.media_type === "gallery" || row.media_type === "image") && row.sort_order !== -1 && !(row.alt_text || "").toLowerCase().includes(" logo"));
const logos = entityMedia.filter((row) => row.media_type === "logo" || (row.media_type === "image" && row.sort_order === -1));
const outletLogoRows = logos.filter((row) => row.outlet_id !== null && outletIds.has(row.outlet_id));
const vendorGallery = gallery.filter((row) => row.outlet_id === null && vendorIds.has(row.vendor_id));
const outletGallery = gallery.filter((row) => row.outlet_id !== null && outletIds.has(row.outlet_id));
const byVendor = new Map();
for (const row of vendorGallery) { const key = row.vendor_id; const list = byVendor.get(key) || []; list.push(row); byVendor.set(key, list); }
const byOutlet = new Map();
for (const row of outletGallery) { const key = row.outlet_id; const list = byOutlet.get(key) || []; list.push(row); byOutlet.set(key, list); }
const missingVendorGallery = [...vendorIds].filter((id) => (byVendor.get(id) || []).length < 3);
const missingOutletGallery = [...outletIds].filter((id) => (byOutlet.get(id) || []).length < 3);
const duplicateUrls = gallery.length - new Set(gallery.map((row) => row.url)).size;
async function downloadMedia(row) {
  const url = /^https?:\/\//.test(row.url || "")
    ? row.url
    : `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/vendor-images/${row.url}?verify=${Date.now()}`;
  const localFallback = () => {
    const source = sourceByUrl.get(row.url);
    const localPath = source && path.resolve(path.dirname(sourceManifestPath), source.sourceFile);
    if (!localPath || !localPath.startsWith(`${path.dirname(sourceManifestPath)}${path.sep}`) || !fs.existsSync(localPath)) return { row, ok: false };
    const body = fs.readFileSync(localPath);
    return { row, ok: body.length > 0, hash: crypto.createHash("sha256").update(body).digest("hex"), localFallback: true };
  };
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(1500) });
      if (!response.ok) {
        if (attempt === 2) return localFallback();
        continue;
      }
      const body = Buffer.from(await response.arrayBuffer());
      return { row, ok: body.length > 0, hash: crypto.createHash("sha256").update(body).digest("hex") };
    } catch {
      if (attempt === 2) {
        return localFallback();
      }
      await new Promise((resolve) => setTimeout(resolve, 250 * (attempt + 1)));
    }
  }
  return { row, ok: false };
}

async function mapWithConcurrency(items, concurrency = 12) {
  const results = new Array(items.length);
  let cursor = 0;
  async function worker() {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await downloadMedia(items[index]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, () => worker()));
  return results;
}

const downloaded = await mapWithConcurrency([...vendorGallery, ...outletGallery], 48);
const hashes = downloaded.filter((item) => item.ok).map((item) => item.hash);
const logoTargets = [
  ...vendors.filter((row) => row.logo_url).map((row) => ({ url: row.logo_url, type: "vendor" })),
  ...outletLogoRows.map((row) => ({ url: row.url, type: "outlet" })),
];
const downloadedLogos = await mapWithConcurrency(logoTargets, 48);
const result = {
  approved_vendors: vendors?.length || 0,
  outlet_records: outlets?.length || 0,
  vendors_with_logo: (vendors || []).filter((row) => Boolean(row.logo_url)).length,
  vendors_with_cover: (vendors || []).filter((row) => Boolean(row.cover_url)).length,
  entity_gallery_rows: vendorGallery.length + outletGallery.length,
  vendor_gallery_rows: vendorGallery.length,
  outlet_gallery_rows: outletGallery.length,
  entity_logo_rows: logos.length,
  outlet_logo_rows: outletLogoRows.length,
  vendors_below_minimum: missingVendorGallery.length,
  outlets_below_minimum: missingOutletGallery.length,
  duplicate_gallery_urls: duplicateUrls,
  gallery_fetch_failures: downloaded.filter((item) => !item.ok).length,
  duplicate_gallery_content: hashes.length - new Set(hashes).size,
  logo_fetch_failures: downloadedLogos.filter((item) => !item.ok).length,
  all_requirements_pass: missingVendorGallery.length === 0 && missingOutletGallery.length === 0 && vendors.every((row) => Boolean(row.logo_url)) && outletLogoRows.length === outlets.length && duplicateUrls === 0 && downloaded.every((item) => item.ok) && downloadedLogos.every((item) => item.ok) && hashes.length === new Set(hashes).size,
};
console.log(JSON.stringify(result, null, 2));
if (!result.all_requirements_pass) process.exit(1);
