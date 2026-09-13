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
if (process.env.VERIFIED_COMMERCE_SCOPE_WRITE !== "1") {
  console.error("Refusing remote scope writes without VERIFIED_COMMERCE_SCOPE_WRITE=1.");
  process.exit(1);
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
if (!url || !serviceKey) throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or service role key.");

const scope = JSON.parse(fs.readFileSync(SCOPE_PATH, "utf8"));
const enabledIds = new Set(scope.outlets.map((outlet) => outlet.id));
if (enabledIds.size !== scope.outlets.length) throw new Error("Scope manifest contains duplicate outlet IDs.");

const supabase = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });
const [vendors, outlets, products, offers] = await Promise.all([
  readAll(supabase, "vendors", "id,name,status"),
  readAll(supabase, "outlets", "id,vendor_id,name,status,review_status"),
  readAll(supabase, "products", "id,vendor_id,outlet_id,name,base_price,status,review_status"),
  readAll(supabase, "outlet_offers", "product_id,outlet_id,price,status"),
]);
const coverage = buildVendorOutletProductCoverage({ vendors, outlets, products, offers, minimumProductsPerOutlet: scope.minimum_products_per_outlet });
const byId = new Map(coverage.coverage.map((row) => [row.outletId, row]));
for (const expected of scope.outlets) {
  const actual = outlets.find((outlet) => outlet.id === expected.id);
  const row = byId.get(expected.id);
  if (!actual || actual.vendor_id !== expected.vendor_id || actual.name !== expected.name || actual.status !== "active" || (actual.review_status && actual.review_status !== "approved")) throw new Error(`Scope outlet identity/status mismatch: ${expected.name}`);
  if (!row || row.missing > 0) throw new Error(`Scope outlet is below product minimum: ${expected.name}`);
}

const approvedActive = outlets.filter((outlet) => outlet.status === "active" && (!outlet.review_status || outlet.review_status === "approved"));
const disableIds = approvedActive.filter((outlet) => !enabledIds.has(outlet.id)).map((outlet) => outlet.id);
for (let start = 0; start < disableIds.length; start += 100) {
  const batch = disableIds.slice(start, start + 100);
  const { error } = await supabase.from("outlets").update({ review_status: "pending_review" }).in("id", batch).eq("status", "active").eq("review_status", "approved");
  if (error) throw new Error(`outlet scope update failed: ${error.message}`);
}
for (let start = 0; start < scope.outlets.length; start += 100) {
  const batch = scope.outlets.slice(start, start + 100).map((outlet) => outlet.id);
  const { error } = await supabase.from("outlets").update({ status: "active", review_status: "approved" }).in("id", batch);
  if (error) throw new Error(`enabled outlet confirmation failed: ${error.message}`);
}

console.log(JSON.stringify({
  message: "Enabled commerce outlet scope applied",
  enabledOutlets: scope.outlets.length,
  movedOutsideScope: disableIds.length,
  preserved: true,
  minimumProductsPerOutlet: scope.minimum_products_per_outlet,
}, null, 2));
