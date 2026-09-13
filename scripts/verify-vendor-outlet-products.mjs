#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import { buildVendorOutletProductCoverage } from "./lib/vendor-outlet-product-coverage.mjs";

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

loadEnv();
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
if (!url || !key) throw new Error("Missing Supabase environment.");
const supabase = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });

async function readAll(table, select) {
  const rows = [];
  for (let start = 0; ; start += 1000) {
    const { data, error } = await supabase.from(table).select(select).range(start, start + 999);
    if (error) throw new Error(`${table} read failed: ${error.message}`);
    rows.push(...(data ?? []));
    if ((data ?? []).length < 1000) return rows;
  }
}

const [vendors, outlets, products, offers] = await Promise.all([
  readAll("vendors", "id,name,status"),
  readAll("outlets", "id,vendor_id,name,status,review_status"),
  readAll("products", "id,vendor_id,outlet_id,name,base_price,status,review_status"),
  readAll("outlet_offers", "product_id,outlet_id,price,status"),
]);
const result = buildVendorOutletProductCoverage({ vendors, outlets, products, offers });
const failures = result.coverage.filter((row) => row.missing > 0);
console.log(JSON.stringify({
  minimum_products_per_outlet: result.minimumProductsPerOutlet,
  active_outlets: result.activeOutletCount,
  active_approved_products: result.activeProductCount,
  outlets_at_minimum: result.coverage.length - failures.length,
  outlets_below_minimum: failures.length,
  total_missing_outlet_product_links: failures.reduce((total, row) => total + row.missing, 0),
  sample_failures: failures.slice(0, 20),
  cross_vendor_issues: result.issues.filter((issue) => issue.code.includes("vendor_mismatch")),
}, null, 2));
if (!result.allRequirementsPass) process.exit(1);
