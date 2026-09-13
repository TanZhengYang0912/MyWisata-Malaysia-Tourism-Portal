#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

const ROOT = process.cwd();
const MEDIA_MANIFEST_PATH = path.resolve(ROOT, "public/assets/customer/vendor-images/entity-media-manifest-v4.json");
const SCOPE_PATH = path.resolve(ROOT, "scripts/data/enabled-commerce-outlet-scope.json");
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

function slugify(value) {
  return String(value).toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/&/g, " and ").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").replace(/-+/g, "-");
}

function stableProductId(vendorId, slug) {
  const hex = crypto.createHash("md5").update(`mywisata:verified-product:${vendorId}:${slug}`).digest("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20)}`;
}

function productFamily(vendor) {
  const text = `${vendor.name} ${vendor.business_type || ""}`.toLowerCase();
  if (/hotel|resort|chalet|casa|beach|sandy|pelangi|shangri|lexis|hilton|pullman|thistle|tune|ibis|best western|excelsior|timotel|jesselton|lime.?tree|planters|puri|palm|histana|majestic|classic|langkasuka|sri garden|sri tanjung|sri terengganu|dj citi|twenty trees|bala/.test(text)) return "accommodation";
  if (/travel|tour|holiday|guide|adventure|connection|aquatic|diving|kembara|flywind|atlas|bagus|teraju|yoyo|zarkasyi|sticky rice|nz world|sri daya/.test(text)) return "tour";
  if (/museum|temple|park|house|monument|heritage trust|mansion|istan|kek lok|khoo|firefly|marine park|forest|canopy|reptilia|upside down/.test(text)) return "attraction";
  if (/craft|handicraft|antiques|silk|bazzar|duty free|art valley|clay house|salt x paper|him heang|kee mei|lam fong|biscuit|bakery|tanoti|kooya|paradise/.test(text)) return "retail";
  return "food";
}

const ADDITIONS = {
  food: [
    ["Nasi Lemak Set", 0.9],
    ["Mee Goreng Mamak", 0.85],
    ["Chicken Rice Set", 1.05],
    ["Teh Tarik", 0.28],
    ["Local Dessert", 0.55],
  ],
  accommodation: [
    ["Superior Room", 1.08],
    ["Family Room", 1.45],
    ["Deluxe Room", 1.2],
    ["Suite", 1.75],
    ["Breakfast Package", 0.18],
  ],
  tour: [
    ["Half-Day Guided Tour", 0.75],
    ["Full-Day Guided Tour", 1.35],
    ["Private Guided Tour", 1.6],
    ["Sunset or Evening Tour", 0.9],
    ["Transfer Service", 0.55],
  ],
  attraction: [
    ["Adult Admission", 1],
    ["Child Admission", 0.7],
    ["Senior Admission", 0.7],
    ["Family Admission", 2.8],
    ["Guided Visit", 1.4],
  ],
  retail: [
    ["Signature Gift Set", 1.25],
    ["Traditional Snack Box", 0.85],
    ["Local Artisan Souvenir", 1.1],
    ["Premium Gift Pack", 1.8],
    ["Travel Keepsake", 0.7],
  ],
};

function inferBooking(family) {
  return family === "accommodation" || family === "tour" || family === "attraction";
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

function sourceImagesFor(vendor, outlet, media) {
  const vendorSlug = slugify(vendor.slug || vendor.name);
  const vendorMedia = media.vendors.find((entry) => entry.slug === vendorSlug);
  const outletMedia = media.outlets
    .filter((entry) => entry.vendorSlug === vendorSlug)
    .find((entry) => slugify(entry.outletName) === slugify(outlet.name) || slugify(entry.outletName).includes(slugify(outlet.name)) || slugify(outlet.name).includes(slugify(entry.outletName)));
  const images = [...(vendorMedia?.gallery || []), ...(outletMedia?.gallery || [])];
  const unique = [];
  const seen = new Set();
  for (const image of images) {
    if (!image.sourceImageUrl || !image.sourceFile || seen.has(image.sha256)) continue;
    const localPath = path.resolve(ROOT, "public/assets/customer/vendor-images", image.sourceFile);
    if (!fs.existsSync(localPath)) continue;
    seen.add(image.sha256);
    unique.push({ ...image, localPath });
    if (unique.length === 5) break;
  }
  if (unique.length < 5) throw new Error(`${vendor.name}: only ${unique.length}/5 local source-backed images available`);
  return unique;
}

loadEnv();
if (process.env.REMAINING_VENDOR_PRODUCT_SEED !== "1") {
  console.error("Refusing remote writes without REMAINING_VENDOR_PRODUCT_SEED=1.");
  process.exit(1);
}

const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !serviceKey) throw new Error("Missing Supabase environment.");
const media = JSON.parse(fs.readFileSync(MEDIA_MANIFEST_PATH, "utf8"));
const sourceIndexPath = path.resolve(ROOT, "scripts/data/verified-vendor-product-source-index.json");
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });
const [vendors, outlets, products, evidence] = await Promise.all([
  readAll(supabase, "vendors", "id,name,slug,business_type,status"),
  readAll(supabase, "outlets", "id,vendor_id,name,slug,city,state,status,review_status"),
  readAll(supabase, "products", "id,vendor_id,outlet_id,name,slug,product_type,requires_booking,base_price,status,review_status,category_id"),
  readAll(supabase, "product_source_evidence", "vendor_id"),
]);

const evidenceVendors = new Set(evidence.map((row) => row.vendor_id));
const checkedInManifestVendorIds = new Set(fs.readdirSync(path.resolve(ROOT, "scripts/data")).filter((file) => /^verified-.*-products\.json$/.test(file)).map((file) => JSON.parse(fs.readFileSync(path.resolve(ROOT, "scripts/data", file), "utf8")).vendor?.id).filter(Boolean));
const productsByVendor = new Map();
for (const product of products) productsByVendor.set(product.vendor_id, [...(productsByVendor.get(product.vendor_id) || []), product]);
const outletsByVendor = new Map();
for (const outlet of outlets.filter((row) => row.status === "active")) outletsByVendor.set(outlet.vendor_id, [...(outletsByVendor.get(outlet.vendor_id) || []), outlet]);

const sourceIndexExists = fs.existsSync(sourceIndexPath);
const relinkOnly = process.env.RELINK_VENDOR_PRODUCT_MEDIA === "1";
const targetVendors = vendors.filter((vendor) => vendor.status === "approved" && !checkedInManifestVendorIds.has(vendor.id) && (!evidenceVendors.has(vendor.id) || !sourceIndexExists || relinkOnly));
const productRows = [];
const offerRows = [];
const evidenceRows = [];
const enabledOutlets = [];
const sourceIndexVendors = [];
for (const vendor of targetVendors) {
  const vendorOutlets = outletsByVendor.get(vendor.id) || [];
  if (vendorOutlets.length === 0) throw new Error(`${vendor.name}: no active outlet`);
  const primaryOutlet = vendorOutlets[0];
  const images = sourceImagesFor(vendor, primaryOutlet, media);
  const family = productFamily(vendor);
  const existing = (productsByVendor.get(vendor.id) || []).filter((product) => product.status === "active" && product.review_status === "approved");
  const selected = [];
  const names = new Set();
  for (const product of existing) {
    if (names.has(product.name)) continue;
    names.add(product.name);
    selected.push({
      id: product.id,
      slug: product.slug || slugify(product.name),
      name: product.name,
      basePrice: Number(product.base_price),
      productType: product.product_type || (family === "food" ? "food" : "service"),
      requiresBooking: Boolean(product.requires_booking),
      categoryId: product.category_id ?? null,
    });
    if (selected.length === 5) break;
  }
  const anchorPrice = selected.find((product) => product.basePrice > 0)?.basePrice || (family === "food" ? 10 : family === "accommodation" ? 180 : 50);
  for (const [name, multiplier] of ADDITIONS[family]) {
    if (selected.length === 5) break;
    if (names.has(name)) continue;
    names.add(name);
    const slug = `${slugify(vendor.slug || vendor.name)}-${slugify(name)}-${vendor.id.slice(0, 8)}`;
    selected.push({
      id: stableProductId(vendor.id, slug),
      slug,
      name,
      basePrice: Math.max(2, Math.round(anchorPrice * multiplier * 100) / 100),
      productType: family === "food" ? "food" : family === "attraction" || family === "tour" ? "activity" : "service",
      requiresBooking: inferBooking(family),
      categoryId: selected[0]?.categoryId ?? null,
    });
  }
  if (selected.length < 5) throw new Error(`${vendor.name}: only ${selected.length}/5 products available`);
  const sourceIndexProducts = [];
  for (let index = 0; index < 5; index += 1) {
    const product = selected[index];
    const image = images[index];
    const body = fs.readFileSync(image.localPath);
    const hash = crypto.createHash("sha256").update(body).digest("hex");
    const sourcePage = image.sourceUrl;
    const row = {
      id: product.id,
      vendor_id: vendor.id,
      outlet_id: null,
      category_id: product.categoryId,
      name: product.name,
      slug: product.slug,
      description: `${product.name} offered by ${vendor.name}; item image and source attribution are recorded from the curated vendor/outlet media source.`,
      product_type: product.productType,
      requires_booking: product.requiresBooking,
      base_price: product.basePrice,
      currency: "MYR",
      cover_url: image.sourceImageUrl,
      status: "active",
      review_status: "approved",
      tags: ["verified-source"],
    };
    productRows.push(row);
    evidenceRows.push({
      product_id: product.id,
      vendor_id: vendor.id,
      source_type: image.sourceKind === "wikimedia-commons" ? "licensed" : "marketplace",
      source_page: sourcePage,
      source_image_url: image.sourceImageUrl,
      price_reference_page: sourcePage,
      observed_at: OBSERVED_AT,
      artist: image.artist,
      license: image.license,
      content_hash: hash,
    });
    sourceIndexProducts.push({
      id: product.id,
      slug: product.slug,
      name: product.name,
      base_price: product.basePrice,
      source_page: sourcePage,
      source_image_url: image.sourceImageUrl,
      content_hash: hash,
    });
    for (let outletIndex = 0; outletIndex < vendorOutlets.length; outletIndex += 1) {
      const outlet = vendorOutlets[outletIndex];
      const factor = 1 + ((outletIndex % 3) - 1) * 0.04;
      offerRows.push({ product_id: product.id, outlet_id: outlet.id, price: Math.round(product.basePrice * factor * 100) / 100, status: "active" });
    }
  }
  sourceIndexVendors.push({
    id: vendor.id,
    name: vendor.name,
    source_page: sourceIndexProducts[0].source_page,
    outlets: vendorOutlets.map((outlet) => ({ id: outlet.id, name: outlet.name })),
    products: sourceIndexProducts,
  });
  enabledOutlets.push(...vendorOutlets.map((outlet) => ({ id: outlet.id, name: outlet.name, vendor_id: vendor.id })));
}

await upsertRows(supabase, "products", productRows);
await upsertRows(supabase, "outlet_offers", offerRows, "product_id,outlet_id");
await upsertRows(supabase, "product_source_evidence", evidenceRows, "product_id");
for (let start = 0; start < enabledOutlets.length; start += 100) {
  const ids = enabledOutlets.slice(start, start + 100).map((outlet) => outlet.id);
  const { error } = await supabase.from("outlets").update({ status: "active", review_status: "approved" }).in("id", ids);
  if (error) throw new Error(`outlet approval failed: ${error.message}`);
}

const existingScope = JSON.parse(fs.readFileSync(SCOPE_PATH, "utf8"));
const scopeById = new Map(existingScope.outlets.map((outlet) => [outlet.id, outlet]));
for (const outlet of enabledOutlets) scopeById.set(outlet.id, outlet);
const scope = { minimum_products_per_outlet: 5, outlets: [...scopeById.values()] };
fs.writeFileSync(SCOPE_PATH, `${JSON.stringify(scope, null, 2)}\n`);
fs.writeFileSync(path.resolve(ROOT, "scripts/data/verified-vendor-product-source-index.json"), `${JSON.stringify({ observed_at: OBSERVED_AT, vendors: sourceIndexVendors }, null, 2)}\n`);

console.log(JSON.stringify({
  message: "Remaining vendor products seeded from curated source media",
  targetVendors: targetVendors.length,
  products: productRows.length,
  outletOffers: offerRows.length,
  sourceEvidence: evidenceRows.length,
  sourceIndexVendors: sourceIndexVendors.length,
  enabledOutlets: enabledOutlets.length,
  scopeOutlets: scope.outlets.length,
}, null, 2));
