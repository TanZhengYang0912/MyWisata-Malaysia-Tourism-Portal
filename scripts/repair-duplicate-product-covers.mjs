#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import { assignUniqueProductMedia, loadProductImageCandidates } from "./lib/product-cover-unique-assignment.mjs";

const ROOT = process.cwd();
const DATA_DIR = path.resolve(ROOT, "scripts/data");
const CURRENT_MANIFEST_PATH = path.resolve(DATA_DIR, "product-cover-source-manifest.json");
const ENTITY_MEDIA_PATH = path.resolve(ROOT, "public/assets/customer/vendor-images/entity-media-manifest-v4.json");
const MIGRATION_PATH = path.resolve(ROOT, "supabase/migrations/20260913180000_unique_product_cover_images.sql");
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

function escapeSql(value) {
  return String(value ?? "").replaceAll("'", "''");
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

async function updateProducts(supabase, assignments) {
  const baseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL.replace(/\/$/, "");
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
  const failures = [];
  let next = 0;
  async function worker() {
    while (next < assignments.length) {
      const { product, candidate } = assignments[next++];
      let updated = false;
      let lastError = "update failed";
      for (let attempt = 0; attempt < 3 && !updated; attempt += 1) {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 20000);
        try {
          const response = await fetch(`${baseUrl}/rest/v1/products?id=eq.${encodeURIComponent(product.id)}`, {
            method: "PATCH",
            headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, "Content-Type": "application/json", Prefer: "return=minimal" },
            body: JSON.stringify({ cover_url: candidate.asset_path }),
            signal: controller.signal,
          });
          if (response.ok) updated = true;
          else lastError = `${response.status} ${String(await response.text()).slice(0, 160)}`;
        } catch (error) {
          lastError = error.name === "AbortError" ? "timeout after 20s" : error.message;
        } finally {
          clearTimeout(timeout);
        }
      }
      if (!updated) failures.push(`${product.slug}: ${lastError}`);
    }
  }
  await Promise.all(Array.from({ length: 8 }, () => worker()));
  if (failures.length) throw new Error(`product cover updates failed: ${failures.slice(0, 5).join("; ")}`);
}

async function uploadAssets(supabase, assignments) {
  const assets = [...new Map(assignments.map(({ candidate }) => [candidate.asset_path, candidate])).values()];
  const existing = new Set();
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await supabase.storage.from("product-images").list("products", { limit: 1000, offset });
    if (error) throw new Error(`product asset listing failed: ${error.message}`);
    for (const item of data ?? []) existing.add(item.name);
    if ((data ?? []).length < 1000) break;
  }
  const pending = assets.filter((candidate) => !existing.has(candidate.filename));
  const failures = [];
  let next = 0;
  const baseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL.replace(/\/$/, "");
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
  async function worker() {
    while (next < pending.length) {
      const candidate = pending[next++];
      const filepath = path.resolve(ROOT, "public", candidate.asset_path.slice(1));
      const extension = path.extname(filepath).toLowerCase();
      const contentType = extension === ".png" ? "image/png" : extension === ".webp" ? "image/webp" : "image/jpeg";
      let uploaded = false;
      let lastError = "upload failed";
      for (let attempt = 0; attempt < 3 && !uploaded; attempt += 1) {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 30000);
        try {
          const response = await fetch(`${baseUrl}/storage/v1/object/product-images/products/${encodeURIComponent(candidate.filename)}`, {
            method: "POST",
            headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, "Content-Type": contentType, "x-upsert": "true" },
            body: fs.readFileSync(filepath),
            signal: controller.signal,
          });
          if (response.ok) uploaded = true;
          else lastError = `${response.status} ${String(await response.text()).slice(0, 160)}`;
        } catch (error) {
          lastError = error.name === "AbortError" ? "timeout after 30s" : error.message;
        } finally {
          clearTimeout(timeout);
        }
      }
      if (!uploaded) failures.push(`${candidate.filename}: ${lastError}`);
    }
  }
  await Promise.all(Array.from({ length: 6 }, () => worker()));
  if (failures.length) throw new Error(`product asset uploads failed: ${failures.slice(0, 5).join("; ")}`);
  return { total: assets.length, alreadyPresent: assets.length - pending.length, uploaded: pending.length };
}

async function upsertEvidence(supabase, assignments) {
  const rows = assignments.map(({ product, candidate }) => ({
    product_id: product.id,
    vendor_id: product.vendor_id,
    source_type: persistedSourceType(candidate.source_type),
    source_page: candidate.source_page,
    source_image_url: candidate.source_image_url,
    price_reference_page: product.price_reference_page ?? null,
    observed_at: OBSERVED_AT,
    artist: candidate.artist,
    license: candidate.license,
    content_hash: candidate.sha256,
  }));
  const baseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL.replace(/\/$/, "");
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
  for (let start = 0; start < rows.length; start += 100) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30000);
    try {
      const response = await fetch(`${baseUrl}/rest/v1/product_source_evidence?on_conflict=product_id`, {
        method: "POST",
        headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, "Content-Type": "application/json", Prefer: "resolution=merge-duplicates,return=minimal" },
        body: JSON.stringify(rows.slice(start, start + 100)),
        signal: controller.signal,
      });
      if (!response.ok) throw new Error(`${response.status} ${String(await response.text()).slice(0, 200)}`);
    } catch (error) {
      throw new Error(`product_source_evidence upsert failed: ${error.name === "AbortError" ? "timeout after 30s" : error.message}`);
    } finally {
      clearTimeout(timeout);
    }
  }
}

function writeManifest(assignments) {
  const products = assignments.map(({ product, candidate }) => ({
    product_id: product.id,
    vendor_id: product.vendor_id,
    slug: product.slug,
    name: product.name,
    source_key: `${product.name.toLowerCase()}||${product.product_type ?? "service"}`,
    asset_path: candidate.asset_path,
    source_type: candidate.source_type,
    source_page: candidate.source_page,
    source_image_url: candidate.source_image_url,
    title: candidate.title,
    artist: candidate.artist,
    license: candidate.license,
    sha256: candidate.sha256,
  })).sort((left, right) => left.slug.localeCompare(right.slug));
  fs.writeFileSync(CURRENT_MANIFEST_PATH, `${JSON.stringify({ observed_at: OBSERVED_AT, products }, null, 2)}\n`);
  return products;
}

function writeMigration(products) {
  const lines = [
    "-- Generated by scripts/repair-duplicate-product-covers.mjs.",
    "-- Every active approved product receives a different local product image.",
    "BEGIN;",
    "",
  ];
  for (const product of products) {
    lines.push(`UPDATE public.products SET cover_url = '${escapeSql(product.asset_path)}' WHERE id = '${escapeSql(product.product_id)}' AND status = 'active' AND review_status = 'approved';`);
  }
  lines.push("", "INSERT INTO public.product_source_evidence (product_id, vendor_id, source_type, source_page, source_image_url, observed_at, artist, license, content_hash)");
  lines.push("VALUES");
  lines.push(products.map((product, index) => `  ('${escapeSql(product.product_id)}', '${escapeSql(product.vendor_id)}', '${escapeSql(persistedSourceType(product.source_type))}', '${escapeSql(product.source_page)}', '${escapeSql(product.source_image_url)}', '${OBSERVED_AT}', '${escapeSql(product.artist)}', '${escapeSql(product.license)}', '${escapeSql(product.sha256)}')${index === products.length - 1 ? "" : ","}`).join("\n"));
  lines.push("", "ON CONFLICT (product_id) DO UPDATE SET", "  vendor_id = EXCLUDED.vendor_id,", "  source_type = EXCLUDED.source_type,", "  source_page = EXCLUDED.source_page,", "  source_image_url = EXCLUDED.source_image_url,", "  observed_at = EXCLUDED.observed_at,", "  artist = EXCLUDED.artist,", "  license = EXCLUDED.license,", "  content_hash = EXCLUDED.content_hash;", "");
  lines.push("DO $$", "DECLARE scoped_count integer; missing_count integer; unique_count integer;", "BEGIN");
  lines.push("  SELECT count(*) INTO scoped_count FROM public.products WHERE status = 'active' AND review_status = 'approved';");
  lines.push("  SELECT count(*) INTO missing_count FROM public.products WHERE status = 'active' AND review_status = 'approved' AND cover_url IS NULL;");
  lines.push("  SELECT count(DISTINCT cover_url) INTO unique_count FROM public.products WHERE status = 'active' AND review_status = 'approved';");
  lines.push(`  IF scoped_count <> ${products.length} OR missing_count <> 0 OR unique_count <> ${products.length} THEN RAISE EXCEPTION 'unique product cover postcondition failed: count=%, missing=%, unique=%', scoped_count, missing_count, unique_count; END IF;`);
  lines.push("  IF EXISTS (SELECT 1 FROM public.products WHERE status = 'active' AND review_status = 'approved' AND cover_url NOT LIKE '/assets/customer/products/%') THEN RAISE EXCEPTION 'product cover path is not local'; END IF;");
  lines.push("END $$;", "", "COMMIT;", "");
  fs.writeFileSync(MIGRATION_PATH, lines.join("\n"));
}

loadEnv();
if (process.env.UNIQUE_PRODUCT_COVER_REPAIR !== "1") {
  console.error("Refusing remote product-cover writes without UNIQUE_PRODUCT_COVER_REPAIR=1.");
  process.exit(1);
}
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !serviceKey) throw new Error("Missing Supabase environment.");

const currentManifest = readJson(CURRENT_MANIFEST_PATH).products ?? [];
const verifiedProducts = [];
for (const filename of fs.readdirSync(DATA_DIR).filter((name) => /^verified-.*-products\.json$/.test(name))) {
  verifiedProducts.push(...(readJson(path.join(DATA_DIR, filename)).products ?? []));
}
const entityMedia = readJson(ENTITY_MEDIA_PATH);
const candidates = loadProductImageCandidates({ root: ROOT, currentManifest, verifiedProducts, entityMedia });
if (candidates.length < currentManifest.length) throw new Error(`Only ${candidates.length} unique credited local images are available for ${currentManifest.length} products.`);
const dryRun = process.env.UNIQUE_PRODUCT_COVER_REPAIR_DRY_RUN === "1";

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });
const liveProducts = await readAll(supabase, "products", "id,slug,vendor_id,status,review_status");
const liveScoped = liveProducts.filter((product) => product.status === "active" && product.review_status === "approved");
if (liveScoped.length !== currentManifest.length) throw new Error(`Live active approved product count changed: expected ${currentManifest.length}, received ${liveScoped.length}.`);
const liveIds = new Set(liveScoped.map((product) => product.id));
const liveBySlug = new Map(liveScoped.map((product) => [product.slug, product]));
const products = currentManifest.map((product) => ({
  ...product,
  id: product.product_id ?? liveBySlug.get(product.slug)?.id,
  vendor_id: product.vendor_id ?? liveBySlug.get(product.slug)?.vendor_id,
}));
if (products.some((product) => !product.id || !liveIds.has(product.id))) throw new Error("Manifest product IDs no longer match the live active approved catalogue.");
const assignments = assignUniqueProductMedia(products, candidates);
console.log(JSON.stringify({ activeApprovedProducts: products.length, creditedUniqueCandidates: candidates.length, assignedUniqueImages: new Set(assignments.map(({ candidate }) => candidate.sha256)).size }, null, 2));

if (dryRun) {
  console.log(JSON.stringify({ message: "Unique product cover repair preflight passed", sample: assignments.slice(0, 8).map(({ product, candidate }) => ({ slug: product.slug, asset_path: candidate.asset_path, source_page: candidate.source_page })) }, null, 2));
  process.exit(0);
}

const manifestProducts = assignments.map(({ product, candidate }) => ({
  product_id: product.id,
  vendor_id: product.vendor_id,
  slug: product.slug,
  name: product.name,
  source_type: candidate.source_type,
  source_page: candidate.source_page,
  source_image_url: candidate.source_image_url,
  asset_path: candidate.asset_path,
  artist: candidate.artist,
  license: candidate.license,
  title: candidate.title,
  sha256: candidate.sha256,
}));
writeManifest(assignments);
writeMigration(manifestProducts);
const uploadedAssets = await uploadAssets(supabase, assignments);
await updateProducts(supabase, assignments);
await upsertEvidence(supabase, assignments);

const readback = await readAll(supabase, "products", "id,cover_url,status,review_status");
const scopedReadback = readback.filter((product) => product.status === "active" && product.review_status === "approved");
const distinctCovers = new Set(scopedReadback.map((product) => product.cover_url));
if (scopedReadback.length !== currentManifest.length || distinctCovers.size !== currentManifest.length || scopedReadback.some((product) => !String(product.cover_url ?? "").startsWith("/assets/customer/products/"))) {
  throw new Error(`Remote uniqueness postcondition failed: products=${scopedReadback.length}, distinctCovers=${distinctCovers.size}`);
}
console.log(JSON.stringify({ message: "All active approved product covers are now unique", remoteProducts: scopedReadback.length, remoteDistinctCovers: distinctCovers.size, uploadedAssets, manifest: CURRENT_MANIFEST_PATH, migration: MIGRATION_PATH }, null, 2));
