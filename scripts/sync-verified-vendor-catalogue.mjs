#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import {
  buildVerifiedOfferRows,
  buildVerifiedProductRows,
  getVerifiedAssetContentType,
  readVerifiedCatalogue,
  validateVerifiedCatalogue,
} from "./lib/verified-vendor-catalogue.mjs";

const ROOT = process.cwd();
const manifestPath = path.resolve(ROOT, process.env.VERIFIED_VENDOR_CATALOGUE_MANIFEST ?? "scripts/data/verified-baba-house-products.json");
const BUCKET = "product-images";

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

async function upsertRows(supabase, table, rows, onConflict = "id") {
  for (let start = 0; start < rows.length; start += 100) {
    const { error } = await supabase.from(table).upsert(rows.slice(start, start + 100), { onConflict });
    if (error) throw new Error(`${table} upsert failed: ${error.message}`);
  }
}

loadEnv();
if (process.env.VERIFIED_VENDOR_CATALOGUE_SEED !== "1") {
  console.error("Refusing remote writes without VERIFIED_VENDOR_CATALOGUE_SEED=1.");
  process.exit(1);
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
if (!url || !serviceKey) throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or service role key.");

const data = readVerifiedCatalogue(manifestPath);
const preflight = validateVerifiedCatalogue(data, { root: ROOT });
if (!preflight.allRequirementsPass) throw new Error(`Verified catalogue preflight failed: ${preflight.issues.join("; ")}`);

const supabase = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });
const { data: vendor, error: vendorError } = await supabase.from("vendors").select("id,name,status").eq("id", data.vendor.id).maybeSingle();
if (vendorError) throw new Error(`vendor read failed: ${vendorError.message}`);
if (!vendor || vendor.name !== data.vendor.name || vendor.status !== "approved") throw new Error("Target vendor identity/status does not match the verified source manifest.");

const { data: outlets, error: outletError } = await supabase.from("outlets").select("id,name,vendor_id,status,review_status").eq("vendor_id", vendor.id).in("id", data.outlets.map((outlet) => outlet.id));
if (outletError) throw new Error(`outlet read failed: ${outletError.message}`);
const outletById = new Map((outlets ?? []).map((outlet) => [outlet.id, outlet]));
for (const expected of data.outlets) {
  const actual = outletById.get(expected.id);
  if (!actual || actual.name !== expected.name || actual.vendor_id !== vendor.id || actual.status !== "active") throw new Error(`Outlet identity/status does not match manifest: ${expected.name}`);
}

const { data: existing, error: existingError } = await supabase.from("products").select("id,slug,category_id").eq("vendor_id", vendor.id);
if (existingError) throw new Error(`existing product read failed: ${existingError.message}`);
const productRows = buildVerifiedProductRows(data, { categoryId: existing?.[0]?.category_id ?? null });
const existingBySlug = new Map((existing ?? []).map((product) => [product.slug, product]));
for (const product of productRows) {
  const previous = existingBySlug.get(product.slug);
  if (previous) product.id = previous.id;
}
for (const product of data.products) {
  const assetPath = path.resolve(ROOT, "public", product.asset_path.replace(/^\//, ""));
  const body = fs.readFileSync(assetPath);
  const { error } = await supabase.storage.from(BUCKET).upload(`products/${path.basename(product.asset_path)}`, body, { contentType: getVerifiedAssetContentType(product.asset_path), upsert: true });
  if (error) throw new Error(`product image upload failed for ${product.slug}: ${error.message}`);
}

await upsertRows(supabase, "products", productRows);
await upsertRows(supabase, "outlet_offers", buildVerifiedOfferRows(data, productRows), "product_id,outlet_id");

const productBySlug = new Map(productRows.map((product) => [product.slug, product]));
await upsertRows(supabase, "product_source_evidence", data.products.map((product) => ({
  product_id: productBySlug.get(product.slug).id,
  vendor_id: vendor.id,
  source_type: product.source_type,
  source_page: product.source_page,
  source_image_url: product.source_image_url,
  price_reference_page: product.price_reference_page ?? data.vendor.price_reference_page ?? null,
  observed_at: product.observed_at,
  artist: product.artist,
  license: product.license,
  content_hash: product.sha256,
})), "product_id");

if (data.archive_legacy_slugs?.length) {
  const { error } = await supabase.from("products").update({ status: "archived", review_status: "pending_review" }).eq("vendor_id", vendor.id).in("slug", data.archive_legacy_slugs);
  if (error) throw new Error(`legacy product archive failed: ${error.message}`);
}

const { error: approveError } = await supabase.from("outlets").update({ review_status: "approved" }).eq("vendor_id", vendor.id).in("id", data.outlets.map((outlet) => outlet.id));
if (approveError) throw new Error(`outlet approval update failed: ${approveError.message}`);

console.log(JSON.stringify({
  message: "Verified vendor catalogue synced",
  vendor: vendor.name,
  products: productRows.length,
  outlets: data.outlets.length,
  outletOffers: data.outlets.length * productRows.length,
  archivedLegacyProducts: data.archive_legacy_slugs?.length ?? 0,
  source: data.vendor.source_page,
}, null, 2));
