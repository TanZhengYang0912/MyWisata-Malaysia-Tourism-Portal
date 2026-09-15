#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

const ROOT = process.cwd();
const DATA_PATH = path.resolve(ROOT, "scripts/data/verified-vendor-products.json");
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

function stableUuid(value) {
  const hex = crypto.createHash("md5").update(`mywisata:verified-product:${value}`).digest("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20)}`;
}

function readData() {
  return JSON.parse(fs.readFileSync(DATA_PATH, "utf8"));
}

async function upsertRows(supabase, table, rows, onConflict = "id") {
  for (let start = 0; start < rows.length; start += 100) {
    const { error } = await supabase.from(table).upsert(rows.slice(start, start + 100), { onConflict });
    if (error) throw new Error(`${table} upsert failed: ${error.message}`);
  }
}

function verifyLocalAssets(data) {
  const issues = [];
  const hashes = new Set();
  for (const product of data.products) {
    if (product.source_type !== "official" || !product.source_page.startsWith("https://") || !product.source_image_url.startsWith("https://")) {
      issues.push(`invalid source evidence: ${product.slug}`);
    }
    const relative = product.asset_path.replace(/^\//, "");
    const asset = path.resolve(ROOT, "public", relative);
    if (!fs.existsSync(asset)) {
      issues.push(`missing local asset: ${product.asset_path}`);
      continue;
    }
    const hash = crypto.createHash("sha256").update(fs.readFileSync(asset)).digest("hex");
    if (hash !== product.sha256) issues.push(`sha256 mismatch: ${product.slug}`);
    if (hashes.has(hash)) issues.push(`duplicate image content: ${product.slug}`);
    hashes.add(hash);
  }
  if (issues.length > 0) throw new Error(`Verified product preflight failed: ${issues.join("; ")}`);
}

loadEnv();
if (process.env.VERIFIED_VENDOR_PRODUCT_SEED !== "1") {
  console.error("Refusing remote writes without VERIFIED_VENDOR_PRODUCT_SEED=1.");
  process.exit(1);
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
if (!url || !serviceKey) throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or service role key.");

const data = readData();
verifyLocalAssets(data);
const supabase = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });

const { data: vendor, error: vendorError } = await supabase.from("vendors").select("id,name,status").eq("id", data.vendor.id).maybeSingle();
if (vendorError) throw new Error(`vendor read failed: ${vendorError.message}`);
if (!vendor || vendor.name !== data.vendor.name || vendor.status !== "approved") throw new Error("Target vendor identity/status does not match the verified source manifest.");

const { data: outlets, error: outletError } = await supabase.from("outlets").select("id,name,vendor_id,status,review_status").eq("vendor_id", vendor.id).in("id", data.outlets.map((outlet) => outlet.id));
if (outletError) throw new Error(`outlet read failed: ${outletError.message}`);
const outletById = new Map((outlets ?? []).map((outlet) => [outlet.id, outlet]));
for (const expected of data.outlets) {
  const actual = outletById.get(expected.id);
  if (!actual || actual.name !== expected.name || actual.status !== "active" || (actual.review_status && actual.review_status !== "approved")) {
    throw new Error(`Outlet identity/status does not match manifest: ${expected.name}`);
  }
}

const { data: existing, error: existingError } = await supabase.from("products").select("id,category_id").eq("vendor_id", vendor.id).eq("status", "active").eq("review_status", "approved").limit(1);
if (existingError) throw new Error(`existing product read failed: ${existingError.message}`);
const categoryId = existing?.[0]?.category_id ?? null;

const productRows = data.products.map((product) => ({
  id: stableUuid(`product:${vendor.id}:${product.slug}`),
  vendor_id: vendor.id,
  outlet_id: null,
  category_id: categoryId,
  name: product.name,
  slug: product.slug,
  description: product.description,
  product_type: "food",
  requires_booking: false,
  base_price: product.base_price,
  currency: "MYR",
  cover_url: path.basename(product.asset_path),
  status: "active",
  review_status: "approved",
  tags: ["penang", "food", "verified-source"],
}));
const productBySlug = new Map(productRows.map((product) => [product.slug, product]));

for (const product of data.products) {
  const filename = path.basename(product.asset_path);
  const body = fs.readFileSync(path.resolve(ROOT, "public", product.asset_path.replace(/^\//, "")));
  const { error } = await supabase.storage.from(BUCKET).upload(`products/${filename}`, body, { contentType: "image/png", upsert: true });
  if (error) throw new Error(`product image upload failed for ${product.slug}: ${error.message}`);
}

await upsertRows(supabase, "products", productRows);
await upsertRows(supabase, "outlet_offers", data.outlets.flatMap((outlet) => data.products.map((sourceProduct) => ({
  product_id: productBySlug.get(sourceProduct.slug).id,
  outlet_id: outlet.id,
  price: sourceProduct.base_price,
  status: "active",
}))), "product_id,outlet_id");

console.log(JSON.stringify({
  message: "Verified vendor products seeded",
  vendor: vendor.name,
  products: productRows.length,
  outlets: data.outlets.length,
  outletOffers: data.outlets.length * productRows.length,
  source: data.vendor.source_page,
  priceReference: data.vendor.price_reference_page,
}, null, 2));
