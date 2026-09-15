#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

const ROOT = process.cwd();
const DATA_DIR = path.resolve(ROOT, "scripts/data");
const LIBRARY_PATH = path.resolve(ROOT, "scripts/data/product-image-library.json");
const COVER_MANIFEST_PATH = path.resolve(ROOT, "scripts/data/product-cover-source-manifest.json");
const SOURCE_INDEX_PATH = path.resolve(ROOT, "scripts/data/verified-vendor-product-source-index.json");
const OBSERVED_AT = "2026-09-13";

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

function readJson(filepath) {
  return JSON.parse(fs.readFileSync(filepath, "utf8"));
}

function photoCategory(name, fallback) {
  const value = String(name ?? "").toLowerCase();
  if (/\b(?:ticket|admission|entry|pass|tour|walk|trek|trail|cruise|guided|visit|transfer|skyway|funicular|yoga)\b|work from heritage|forest bathing|sound healing/.test(value)) return "activity";
  if (/\b(?:room|suite|chalet|villa|bedroom|accommodation)\b|breakfast package/.test(value)) return "accommodation";
  if (/\b(?:gift|souvenir|keepsake|postcard|reader|book|batik|sarong|songket|oil|basket|lampshade|cushion)\b|snack box|tea gift|chocolate box|biscuit box/.test(value)) return "retail";
  if (/\b(?:food|rice|nasi|mee|noodle|laksa|curry|soup|chicken|beef|prawn|shrimp|crab|squid|fish|cake|bun|bread|toast|cendol|coffee|kopi|tea|teh|barley|satay|naan|egg|dessert|drink|smoothie|burger|roti|breakfast)\b/.test(value)) return "food";
  return fallback;
}

function sourceKey(product) {
  let name = String(product.name ?? product.slug ?? "").trim().toLowerCase();
  name = name.replace("bak kut teh", "bah kut teh");
  const fallback = String(product.categories?.slug ?? product.product_type ?? "activity").toLowerCase();
  return `${name}||${photoCategory(name, fallback)}`;
}

function sha256(filepath) {
  return crypto.createHash("sha256").update(fs.readFileSync(filepath)).digest("hex");
}

function assetFile(assetPath) {
  const value = String(assetPath ?? "");
  if (!value.startsWith("/assets/customer/products/") || value.includes("..")) throw new Error(`Invalid product asset path: ${value}`);
  return path.resolve(ROOT, "public", value.slice(1));
}

function readExactSources() {
  const bySlug = new Map();
  for (const filename of fs.readdirSync(DATA_DIR).filter((name) => /^verified-.*-products\.json$/.test(name)).sort()) {
    const payload = readJson(path.join(DATA_DIR, filename));
    for (const item of payload.products ?? []) {
      if (bySlug.has(item.slug)) throw new Error(`Duplicate exact source slug: ${item.slug}`);
      bySlug.set(item.slug, { ...item, source_manifest: filename });
    }
  }
  return bySlug;
}

function validateSource(item, slug) {
  const filepath = assetFile(item.asset_path);
  if (!fs.existsSync(filepath)) throw new Error(`${slug}: local source asset does not exist: ${item.asset_path}`);
  if (!String(item.source_page ?? "").startsWith("https://")) throw new Error(`${slug}: source_page is not HTTPS`);
  if (!String(item.source_image_url ?? "").startsWith("https://")) throw new Error(`${slug}: source_image_url is not HTTPS`);
  if (!String(item.artist ?? "").trim() || !String(item.license ?? "").trim()) throw new Error(`${slug}: source attribution is incomplete`);
  const actualHash = sha256(filepath);
  if (actualHash !== item.sha256) throw new Error(`${slug}: source hash does not match local asset`);
  return { ...item, sha256: actualHash };
}

function persistedSourceType(sourceType) {
  return sourceType === "commons" ? "licensed" : sourceType;
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

async function upsertRows(supabase, table, rows, onConflict = "id") {
  for (let start = 0; start < rows.length; start += 100) {
    const { error } = await supabase.from(table).upsert(rows.slice(start, start + 100), { onConflict });
    if (error) throw new Error(`${table} upsert failed: ${error.message}`);
  }
}

async function updateProducts(supabase, rows) {
  let next = 0;
  const failures = [];
  async function worker() {
    while (next < rows.length) {
      const row = rows[next++];
      const { error } = await supabase.from("products").update({ cover_url: row.cover_url }).eq("id", row.id);
      if (error) failures.push(`${row.slug}: ${error.message}`);
    }
  }
  await Promise.all(Array.from({ length: 8 }, () => worker()));
  if (failures.length) throw new Error(`product cover updates failed: ${failures.slice(0, 5).join("; ")}`);
}

async function uploadAssets(supabase, assets) {
  const failures = [];
  for (const filepath of assets) {
    const extension = path.extname(filepath).toLowerCase();
    const contentType = extension === ".png" ? "image/png" : extension === ".webp" ? "image/webp" : "image/jpeg";
    const { error } = await supabase.storage.from("product-images").upload(`products/${path.basename(filepath)}`, fs.readFileSync(filepath), { contentType, upsert: true });
    if (error) failures.push(`${path.basename(filepath)}: ${error.message}`);
  }
  if (failures.length) throw new Error(`product asset uploads failed: ${failures.slice(0, 5).join("; ")}`);
}

function writeSourceIndex({ vendors, outlets, products, evidence }) {
  const evidenceByProduct = new Map(evidence.map((row) => [row.product_id, row]));
  const outletsByVendor = new Map();
  for (const outlet of outlets.filter((row) => row.status === "active")) {
    outletsByVendor.set(outlet.vendor_id, [...(outletsByVendor.get(outlet.vendor_id) ?? []), outlet]);
  }
  const productsByVendor = new Map();
  for (const product of products.filter((row) => row.status === "active" && row.review_status === "approved")) {
    productsByVendor.set(product.vendor_id, [...(productsByVendor.get(product.vendor_id) ?? []), product]);
  }
  const checkedInVendorIds = new Set();
  for (const filename of fs.readdirSync(DATA_DIR).filter((name) => /^verified-.*-products\.json$/.test(name))) {
    const payload = readJson(path.join(DATA_DIR, filename));
    if (payload.vendor?.id) checkedInVendorIds.add(payload.vendor.id);
  }
  const sourceVendors = vendors.filter((vendor) => vendor.status === "approved" && !checkedInVendorIds.has(vendor.id)).map((vendor) => {
    const vendorProducts = productsByVendor.get(vendor.id) ?? [];
    const mapped = vendorProducts.map((product) => {
      const source = evidenceByProduct.get(product.id);
      return {
        id: product.id,
        slug: product.slug,
        name: product.name,
        base_price: product.base_price,
        source_page: source?.source_page ?? null,
        source_image_url: source?.source_image_url ?? null,
        content_hash: source?.content_hash ?? null,
      };
    });
    return {
      id: vendor.id,
      name: vendor.name,
      source_page: mapped[0]?.source_page ?? null,
      outlets: (outletsByVendor.get(vendor.id) ?? []).map((outlet) => ({ id: outlet.id, name: outlet.name })),
      products: mapped,
    };
  });
  fs.writeFileSync(SOURCE_INDEX_PATH, `${JSON.stringify({ observed_at: OBSERVED_AT, vendors: sourceVendors }, null, 2)}\n`);
  return sourceVendors.length;
}

loadEnv();
if (process.env.PRODUCT_COVER_REPAIR !== "1") {
  console.error("Refusing remote product-cover writes without PRODUCT_COVER_REPAIR=1.");
  process.exit(1);
}
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
if (!url || !serviceKey) throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or service role key.");
if (!fs.existsSync(LIBRARY_PATH)) throw new Error(`Missing curated image library: ${LIBRARY_PATH}`);

const library = readJson(LIBRARY_PATH).products ?? [];
const libraryByKey = new Map(library.map((item) => [item.source_key, item]));
const exactSources = readExactSources();
const supabase = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });
const [products, vendors, outlets] = await Promise.all([
  readAll(supabase, "products", "id,vendor_id,name,slug,product_type,status,review_status,categories(slug)"),
  readAll(supabase, "vendors", "id,name,status"),
  readAll(supabase, "outlets", "id,vendor_id,name,status,review_status"),
]);
const scopedProducts = products.filter((row) => row.status === "active" && row.review_status === "approved");
if (scopedProducts.length !== 904) throw new Error(`Expected 904 active approved products, received ${scopedProducts.length}.`);

const assignments = [];
const assets = new Map();
for (const product of scopedProducts) {
  const exact = exactSources.get(product.slug);
  const source = exact ?? libraryByKey.get(sourceKey(product));
  if (!source) throw new Error(`No source-backed image assignment for ${product.slug} (${product.name})`);
  const checked = validateSource(source, product.slug);
  const coverUrl = checked.asset_path;
  assignments.push({ product, source: checked, cover_url: coverUrl });
  assets.set(coverUrl, assetFile(coverUrl));
}

const dryRun = process.env.PRODUCT_COVER_REPAIR_DRY_RUN === "1";
if (dryRun) {
  const exactCount = assignments.filter(({ product }) => exactSources.has(product.slug)).length;
  const fallbackCount = assignments.filter(({ source }) => Boolean(source.fallback_reason)).length;
  console.log(JSON.stringify({
    message: "Product cover repair preflight passed",
    activeApprovedProducts: scopedProducts.length,
    uniqueAssets: assets.size,
    exactManifestAssignments: exactCount,
    curatedLibraryAssignments: assignments.length - exactCount - fallbackCount,
    realSubjectFallbackAssignments: fallbackCount,
  }, null, 2));
  process.exit(0);
}

if (process.env.PRODUCT_COVER_REPAIR_SKIP_UPLOAD !== "1") await uploadAssets(supabase, [...assets.values()]);
if (process.env.PRODUCT_COVER_REPAIR_SKIP_COVER_UPDATE !== "1") {
  await updateProducts(supabase, assignments.map(({ product, cover_url }) => ({ id: product.id, slug: product.slug, cover_url })));
}
const evidenceRows = assignments.map(({ product, source }) => ({
  product_id: product.id,
  vendor_id: product.vendor_id,
  source_type: persistedSourceType(source.source_type ?? "commons"),
  source_page: source.source_page,
  source_image_url: source.source_image_url,
  price_reference_page: source.price_reference_page ?? null,
  observed_at: OBSERVED_AT,
  artist: source.artist,
  license: source.license,
  content_hash: source.sha256,
}));
await upsertRows(supabase, "product_source_evidence", evidenceRows, "product_id");

const manifestRows = assignments.map(({ product, source }) => ({
  product_id: product.id,
  vendor_id: product.vendor_id,
  slug: product.slug,
  name: product.name,
  source_key: source.source_key ?? sourceKey(product),
  asset_path: source.asset_path,
  source_type: source.source_type ?? "commons",
  source_page: source.source_page,
  source_image_url: source.source_image_url,
  title: source.title ?? null,
  artist: source.artist,
  license: source.license,
  sha256: source.sha256,
  fallback_reason: source.fallback_reason ?? null,
}));
fs.writeFileSync(COVER_MANIFEST_PATH, `${JSON.stringify({ observed_at: OBSERVED_AT, products: manifestRows }, null, 2)}\n`);
const allEvidence = await readAll(supabase, "product_source_evidence", "product_id,vendor_id,source_page,source_image_url,content_hash");
const sourceIndexVendors = writeSourceIndex({ vendors, outlets, products, evidence: allEvidence });

const exactCount = assignments.filter(({ product }) => exactSources.has(product.slug)).length;
const fallbackCount = assignments.filter(({ source }) => Boolean(source.fallback_reason)).length;
console.log(JSON.stringify({
  message: "Product cover images repaired from source-backed real media",
  activeApprovedProducts: scopedProducts.length,
  uniqueUploadedAssets: assets.size,
  exactManifestAssignments: exactCount,
  curatedLibraryAssignments: assignments.length - exactCount - fallbackCount,
  realSubjectFallbackAssignments: fallbackCount,
  sourceEvidenceUpserted: evidenceRows.length,
  sourceIndexVendors,
  manifest: COVER_MANIFEST_PATH,
}, null, 2));
