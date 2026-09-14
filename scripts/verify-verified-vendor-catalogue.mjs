#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

import { buildVendorOutletProductCoverage } from "./lib/vendor-outlet-product-coverage.mjs";

const ROOT = process.cwd();
const DATA_DIR = path.resolve(ROOT, "scripts/data");
const SCOPE_PATH = path.resolve(ROOT, "scripts/data/enabled-commerce-outlet-scope.json");

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

loadEnv();
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
if (!url || !key) throw new Error("Missing Supabase environment.");

const manifestFiles = fs.readdirSync(DATA_DIR).filter((file) => /^verified-.*-products\.json$/.test(file)).sort();
const manifests = manifestFiles.map((file) => ({ file, data: JSON.parse(fs.readFileSync(path.join(DATA_DIR, file), "utf8")) }));
const sourceIndexPath = path.join(DATA_DIR, "verified-vendor-product-source-index.json");
const sourceIndex = fs.existsSync(sourceIndexPath) ? JSON.parse(fs.readFileSync(sourceIndexPath, "utf8")) : { vendors: [] };
const scope = JSON.parse(fs.readFileSync(SCOPE_PATH, "utf8"));
const supabase = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
const [vendors, outlets, products, offers, evidence] = await Promise.all([
  readAll(supabase, "vendors", "id,name,status"),
  readAll(supabase, "outlets", "id,vendor_id,name,status,review_status"),
  readAll(supabase, "products", "id,vendor_id,outlet_id,name,slug,base_price,status,review_status"),
  readAll(supabase, "outlet_offers", "product_id,outlet_id,price,status"),
  readAll(supabase, "product_source_evidence", "product_id,vendor_id,source_page,source_image_url,price_reference_page,observed_at,content_hash"),
]);

const coverage = buildVendorOutletProductCoverage({ vendors, outlets, products, offers, minimumProductsPerOutlet: 5 });
const activeApprovedOutlets = outlets.filter((outlet) => outlet.status === "active" && outlet.review_status === "approved");
const pendingOutlets = outlets.filter((outlet) => outlet.status === "active" && outlet.review_status === "pending_review");
const evidenceByVendor = new Map();
for (const row of evidence) evidenceByVendor.set(row.vendor_id, (evidenceByVendor.get(row.vendor_id) ?? 0) + 1);
const manifestVendorIds = new Set(manifests.map(({ data }) => data.vendor?.id).filter(Boolean));
const sourceIndexVendorIds = new Set((sourceIndex.vendors ?? []).map((vendor) => vendor.id).filter(Boolean));
const sourceBackedVendorIds = new Set([...manifestVendorIds, ...sourceIndexVendorIds]);
const manifestProductSlugs = new Set(manifests.flatMap(({ data }) => (data.products ?? []).map((product) => product.slug)));
const duplicateManifestProductSlugs = manifests.flatMap(({ data }) => (data.products ?? []).map((product) => product.slug)).filter((slug, index, all) => all.indexOf(slug) !== index);
const scopeIds = new Set(scope.outlets.map((outlet) => outlet.id));
const vendorById = new Map(vendors.map((vendor) => [vendor.id, vendor]));
const belowMinimum = coverage.coverage.filter((row) => row.missing > 0);
const result = {
    manifests: manifests.map(({ file, data }) => ({
    file,
    vendor: data.vendor?.name ?? null,
    vendor_id: data.vendor?.id ?? null,
    outlets: data.outlets?.length ?? 0,
    products_in_manifest: data.products?.length ?? 0,
      persisted_source_evidence_rows: evidenceByVendor.get(data.vendor?.id) ?? 0,
    })),
    source_index: {
      file: path.basename(sourceIndexPath),
      vendors: sourceIndexVendorIds.size,
      products: (sourceIndex.vendors ?? []).reduce((count, vendor) => count + (vendor.products?.length ?? 0), 0),
    },
  remote: {
    vendors: vendors.length,
    outlets: outlets.length,
    active_approved_outlets: activeApprovedOutlets.length,
    pending_review_outlets: pendingOutlets.length,
    active_approved_products: products.filter((product) => product.status === "active" && product.review_status === "approved").length,
    source_evidence_rows: evidence.length,
  },
  completion: {
    vendors_with_source_manifest: sourceBackedVendorIds.size,
    vendors_without_source_manifest: vendors.filter((vendor) => !sourceBackedVendorIds.has(vendor.id)).map((vendor) => vendor.name),
    vendors_with_persisted_evidence: evidenceByVendor.size,
    outlets_in_enabled_scope: scopeIds.size,
    outlets_below_five_products: belowMinimum.map((row) => ({ name: row.outletName, vendor: row.vendorName, missing: row.missing })),
    duplicate_manifest_product_slugs: [...new Set(duplicateManifestProductSlugs)],
    all_active_approved_outlets_have_five_products: belowMinimum.length === 0,
  },
};
console.log(JSON.stringify(result, null, 2));

// This is a progress report, not an approval command. It exits zero so it can
// be used during batch research while the approved scope remains guarded.
void vendorById;
void manifestProductSlugs;
