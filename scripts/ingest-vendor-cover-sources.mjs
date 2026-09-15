#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

const BUCKET = "vendor-images";
const MANIFEST_PATH = path.resolve(process.cwd(), "public/assets/customer/vendor-images/source-manifest.json");
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
  if (!Array.isArray(manifest.vendors) || !manifest.vendors.length) throw new Error("Vendor source manifest is empty.");
  return manifest.vendors;
}

loadEnv();
if (process.env.VENDOR_COVER_SOURCE_INGEST !== "1") {
  console.error("Refusing to upload vendor covers without VENDOR_COVER_SOURCE_INGEST=1.");
  process.exit(1);
}

const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !serviceKey) throw new Error("Missing Supabase service credentials.");
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });
const entries = readManifest();

if (new Set(entries.map((entry) => entry.slug)).size !== entries.length) throw new Error("Duplicate vendor slugs detected.");
if (new Set(entries.map((entry) => entry.objectPath)).size !== entries.length) throw new Error("Duplicate source object paths detected.");
if (entries.some((entry) => !/^curated-v2\/vendor\/[^/]+\/cover\.jpg$/.test(entry.objectPath))) throw new Error("Unexpected vendor cover object path.");

const prepared = entries.map((entry) => {
  const sourcePath = path.resolve(MEDIA_ROOT, entry.sourceFile);
  if (!sourcePath.startsWith(`${MEDIA_ROOT}${path.sep}`) || !fs.existsSync(sourcePath)) throw new Error(`Missing source file for ${entry.slug}: ${entry.sourceFile}`);
  const body = fs.readFileSync(sourcePath);
  return { ...entry, body, hash: crypto.createHash("sha256").update(body).digest("hex") };
});
if (new Set(prepared.map((entry) => entry.hash)).size !== prepared.length) throw new Error("Duplicate source image content detected.");

const { data: vendors, error: vendorError } = await supabase.from("vendors").select("id,slug").in("slug", entries.map((entry) => entry.slug));
if (vendorError) throw vendorError;
const vendorIdBySlug = new Map((vendors || []).map((vendor) => [vendor.slug, vendor.id]));
const missingVendors = entries.filter((entry) => !vendorIdBySlug.has(entry.slug));
if (missingVendors.length) throw new Error(`No vendor row for: ${missingVendors.map((entry) => entry.slug).join(", ")}`);

for (const entry of prepared) {
  const { error: uploadError } = await supabase.storage.from(BUCKET).upload(entry.objectPath, entry.body, { contentType: "image/jpeg", cacheControl: "31536000", upsert: true });
  if (uploadError) throw uploadError;
  const { error: updateError } = await supabase.from("vendors").update({ cover_url: entry.objectPath }).eq("id", vendorIdBySlug.get(entry.slug));
  if (updateError) throw updateError;
}

const { data: readback, error: readbackError } = await supabase.from("vendors").select("slug,cover_url").in("slug", entries.map((entry) => entry.slug));
if (readbackError) throw readbackError;
const coverBySlug = new Map((readback || []).map((vendor) => [vendor.slug, vendor.cover_url]));
const mismatches = entries.filter((entry) => coverBySlug.get(entry.slug) !== entry.objectPath);
if (mismatches.length) throw new Error(`Cover read-back mismatch: ${mismatches.map((entry) => entry.slug).join(", ")}`);

console.log(JSON.stringify({ uploaded: prepared.length, unique_content: true, source_kinds: prepared.map((entry) => entry.sourceKind) }, null, 2));
