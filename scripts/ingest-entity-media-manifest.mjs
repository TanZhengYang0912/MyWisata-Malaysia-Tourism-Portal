#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

const BUCKET = "vendor-images";
const MANIFEST_PATH = path.resolve(process.cwd(), "public/assets/customer/vendor-images/entity-media-manifest-v4.json");
const MEDIA_ROOT = path.dirname(MANIFEST_PATH);

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

function readManifest() {
  const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, "utf8"));
  if (!Array.isArray(manifest.vendors) || !Array.isArray(manifest.outlets)) throw new Error("Entity media manifest must contain vendors and outlets arrays.");
  return manifest;
}

function assertUnique(values, message) {
  if (new Set(values).size !== values.length) throw new Error(message);
}

loadEnv();
if (process.env.ENTITY_MEDIA_INGEST !== "1") {
  console.error("Refusing to upload entity media without ENTITY_MEDIA_INGEST=1.");
  process.exit(1);
}

const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !serviceKey) throw new Error("Missing Supabase service credentials.");
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });
const manifest = readManifest();
const vendors = manifest.vendors;
const outlets = manifest.outlets;

assertUnique(vendors.map((entry) => entry.slug), "Duplicate vendor slugs detected.");
assertUnique(outlets.map((entry) => entry.outletName), "Duplicate outlet names detected.");
const galleryEntries = [...vendors.flatMap((entry) => entry.gallery), ...outlets.flatMap((entry) => entry.gallery)];
assertUnique(galleryEntries.map((entry) => entry.objectPath), "Duplicate gallery object paths detected.");
assertUnique(galleryEntries.map((entry) => entry.sourceFile), "Duplicate gallery source files detected.");

const preparedGallery = galleryEntries.map((entry) => {
  if (!/^curated-v\d+\/(?:vendor|outlet)\/(?:[^/]+\/){1,2}gallery-\d+\.(?:jpe?g|webp)$/.test(entry.objectPath)) throw new Error(`Unexpected gallery path: ${entry.objectPath}`);
  const sourcePath = path.resolve(MEDIA_ROOT, entry.sourceFile);
  if (!sourcePath.startsWith(`${MEDIA_ROOT}${path.sep}`) || !fs.existsSync(sourcePath)) throw new Error(`Missing source file: ${entry.sourceFile}`);
  const body = fs.readFileSync(sourcePath);
  return { ...entry, body, hash: crypto.createHash("sha256").update(body).digest("hex") };
});
const preparedByPath = new Map(preparedGallery.map((entry) => [entry.objectPath, entry]));
assertUnique(preparedGallery.map((entry) => entry.hash), "Duplicate gallery image content detected.");

const vendorSlugs = vendors.map((entry) => entry.slug);
const { data: vendorRows, error: vendorError } = await supabase.from("vendors").select("id,slug").in("slug", vendorSlugs);
if (vendorError) throw vendorError;
const vendorIdBySlug = new Map((vendorRows || []).map((row) => [row.slug, row.id]));
const missingVendors = vendors.filter((entry) => !vendorIdBySlug.has(entry.slug));
if (missingVendors.length) throw new Error(`No vendor row for: ${missingVendors.map((entry) => entry.slug).join(", ")}`);

const outletVendorIds = [...new Set(outlets.map((entry) => vendorIdBySlug.get(entry.vendorSlug)).filter(Boolean))];
const { data: outletRows, error: outletError } = await supabase.from("outlets").select("id,name,vendor_id").in("vendor_id", outletVendorIds);
if (outletError) throw outletError;
const outletByName = new Map((outletRows || []).map((row) => [`${row.vendor_id}:${row.name}`, row]));
const missingOutlets = outlets.filter((entry) => !outletByName.has(`${vendorIdBySlug.get(entry.vendorSlug)}:${entry.outletName}`));
if (missingOutlets.length) throw new Error(`No outlet row for: ${missingOutlets.map((entry) => entry.outletName).join(", ")}`);

const upload = async (entry, contentType) => {
  const body = new Blob([entry.body], { type: contentType });
  const { error } = await supabase.storage.from(BUCKET).upload(entry.objectPath, body, { contentType, cacheControl: "31536000", upsert: true });
  if (error) throw error;
};

const logoCache = new Map();
const uploadLogo = async (logo) => {
  if (logoCache.has(logo.objectPath)) return;
  if (!/^(?:curated-v\d+|entities)\/(?:vendor|outlet)\/(?:[^/]+\/){0,1}logo\.(?:png|jpe?g|webp|svg)$/.test(logo.objectPath)) throw new Error(`Unexpected logo path: ${logo.objectPath}`);
  if (!logo.sourceFile) { logoCache.set(logo.objectPath, false); return; }
  const sourcePath = path.resolve(MEDIA_ROOT, logo.sourceFile);
  if (!fs.existsSync(sourcePath)) throw new Error(`Missing logo source file: ${sourcePath}`);
  const body = fs.readFileSync(sourcePath);
  await upload({ objectPath: logo.objectPath, body }, "image/png");
  logoCache.set(logo.objectPath, true);
};

for (let start = 0; start < galleryEntries.length; start += 8) {
  const batch = galleryEntries.slice(start, start + 8);
  await Promise.all(batch.map((entry) => upload(preparedByPath.get(entry.objectPath), entry.objectPath.endsWith(".webp") ? "image/webp" : "image/jpeg")));
}

for (const entry of vendors) {
  const vendorId = vendorIdBySlug.get(entry.slug);
  await uploadLogo(entry.logo);
  const { error: vendorUpdateError } = await supabase.from("vendors").update({ logo_url: entry.logo.objectPath, cover_url: entry.gallery[0].objectPath }).eq("id", vendorId);
  if (vendorUpdateError) throw vendorUpdateError;
  const { error: vendorDeleteError } = await supabase.from("media_assets").delete().eq("vendor_id", vendorId).is("outlet_id", null).is("product_id", null).gte("sort_order", 0);
  if (vendorDeleteError) throw vendorDeleteError;
  const { error: vendorMediaError } = await supabase.from("media_assets").insert(entry.gallery.map((galleryEntry, index) => ({ vendor_id: vendorId, outlet_id: null, product_id: null, url: galleryEntry.objectPath, alt_text: galleryEntry.alt, media_type: "image", sort_order: index })));
  if (vendorMediaError) throw vendorMediaError;
}

for (const entry of outlets) {
  const vendorId = vendorIdBySlug.get(entry.vendorSlug);
  const outlet = outletByName.get(`${vendorId}:${entry.outletName}`);
  await uploadLogo(entry.logo);
  const { error: deleteError } = await supabase.from("media_assets").delete().eq("outlet_id", outlet.id).is("product_id", null).gte("sort_order", 0);
  if (deleteError) throw deleteError;
  const { data: existingLogo, error: logoQueryError } = await supabase.from("media_assets").select("id").eq("outlet_id", outlet.id).is("product_id", null).eq("sort_order", -1).limit(1).maybeSingle();
  if (logoQueryError) throw logoQueryError;
  const logoPayload = { vendor_id: vendorId, outlet_id: outlet.id, product_id: null, url: entry.logo.objectPath, alt_text: entry.logo.alt, media_type: "image", sort_order: -1 };
  if (existingLogo) {
    const { error } = await supabase.from("media_assets").update(logoPayload).eq("id", existingLogo.id);
    if (error) throw error;
  } else {
    const { error } = await supabase.from("media_assets").insert(logoPayload);
    if (error) throw error;
  }
  const { error: mediaError } = await supabase.from("media_assets").insert(entry.gallery.map((galleryEntry, index) => ({ vendor_id: vendorId, outlet_id: outlet.id, product_id: null, url: galleryEntry.objectPath, alt_text: galleryEntry.alt, media_type: "image", sort_order: index })));
  if (mediaError) throw mediaError;
}

const { data: vendorReadback, error: vendorReadbackError } = await supabase.from("vendors").select("slug,logo_url").in("slug", vendorSlugs);
if (vendorReadbackError) throw vendorReadbackError;
const vendorLogoBySlug = new Map((vendorReadback || []).map((row) => [row.slug, row.logo_url]));
if (vendors.some((entry) => vendorLogoBySlug.get(entry.slug) !== entry.logo.objectPath)) throw new Error("Vendor logo read-back mismatch.");

console.log(JSON.stringify({ vendors: vendors.length, outlets: outlets.length, gallery_images: galleryEntries.length, unique_gallery_content: true, logos_uploaded: logoCache.size }, null, 2));
