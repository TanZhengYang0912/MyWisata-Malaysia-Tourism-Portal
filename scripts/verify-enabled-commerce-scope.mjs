#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

import { buildVendorOutletProductCoverage } from "./lib/vendor-outlet-product-coverage.mjs";

const ROOT = process.cwd();
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

const scope = JSON.parse(fs.readFileSync(SCOPE_PATH, "utf8"));
const expectedById = new Map(scope.outlets.map((outlet) => [outlet.id, outlet]));
if (expectedById.size !== scope.outlets.length) throw new Error("Scope manifest contains duplicate outlet IDs.");

const supabase = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
const [vendors, outlets, products, offers] = await Promise.all([
  readAll(supabase, "vendors", "id,name,status"),
  readAll(supabase, "outlets", "id,vendor_id,name,status,review_status"),
  readAll(supabase, "products", "id,vendor_id,outlet_id,name,base_price,status,review_status"),
  readAll(supabase, "outlet_offers", "product_id,outlet_id,price,status"),
]);

const coverage = buildVendorOutletProductCoverage({
  vendors,
  outlets,
  products,
  offers,
  minimumProductsPerOutlet: scope.minimum_products_per_outlet,
});
const coverageById = new Map(coverage.coverage.map((row) => [row.outletId, row]));
const failures = [];

for (const expected of scope.outlets) {
  const actual = outlets.find((outlet) => outlet.id === expected.id);
  const row = coverageById.get(expected.id);
  if (!actual) {
    failures.push(`${expected.name}: missing outlet`);
    continue;
  }
  if (actual.vendor_id !== expected.vendor_id || actual.name !== expected.name) failures.push(`${expected.name}: identity mismatch`);
  if (actual.status !== "active" || actual.review_status !== "approved") failures.push(`${expected.name}: not active/approved`);
  if (!row || row.missing > 0) failures.push(`${expected.name}: ${row?.uniqueProductCount ?? 0}/${scope.minimum_products_per_outlet} products`);
}

const enabledIds = new Set(scope.outlets.map((outlet) => outlet.id));
const activeApproved = outlets.filter((outlet) => outlet.status === "active" && outlet.review_status === "approved");
const outsideScopeActiveApproved = activeApproved.filter((outlet) => !enabledIds.has(outlet.id));
const outsideScopePendingReview = outlets.filter((outlet) => outlet.status === "active" && outlet.review_status === "pending_review" && !enabledIds.has(outlet.id));
const result = {
  minimum_products_per_outlet: scope.minimum_products_per_outlet,
  manifest_outlets: scope.outlets.length,
  active_approved_outlets: activeApproved.length,
  enabled_outlets_verified: scope.outlets.length - failures.filter((failure) => failure.includes("not active/approved") || failure.includes("missing outlet") || failure.includes("identity mismatch")).length,
  outside_scope_active_approved: outsideScopeActiveApproved.length,
  outside_scope_pending_review: outsideScopePendingReview.length,
  failures,
  all_requirements_pass: failures.length === 0 && activeApproved.length === scope.outlets.length && outsideScopeActiveApproved.length === 0,
};
console.log(JSON.stringify(result, null, 2));
if (!result.all_requirements_pass) process.exit(1);
