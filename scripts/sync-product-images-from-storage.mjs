#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

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
const targetDir = path.resolve("public/assets/customer/products");
fs.mkdirSync(targetDir, { recursive: true });

const { data: products, error } = await supabase
  .from("products")
  .select("slug,cover_url,status,review_status")
  .eq("status", "active")
  .eq("review_status", "approved")
  .range(0, 999);
if (error) throw new Error(`products read failed: ${error.message}`);

const rows = (products ?? [])
  .map((product) => ({ ...product, filename: path.basename(String(product.cover_url ?? "")) }))
  .filter((product) => product.filename && product.filename !== ".");
const failures = [];
let downloaded = 0;
let skipped = 0;
for (const product of rows) {
  const destination = path.join(targetDir, product.filename);
  if (fs.existsSync(destination)) {
    skipped += 1;
    continue;
  }
  const { data: blob, error: downloadError } = await supabase.storage
    .from("product-images")
    .download(`products/${product.filename}`);
  if (downloadError || !blob) {
    failures.push({ slug: product.slug, filename: product.filename, error: downloadError?.message ?? "empty download" });
    continue;
  }
  fs.writeFileSync(destination, Buffer.from(await blob.arrayBuffer()));
  downloaded += 1;
}

console.log(JSON.stringify({
  active_approved_products: rows.length,
  downloaded,
  skipped_existing: skipped,
  failures: failures.length,
  failure_sample: failures.slice(0, 20),
}, null, 2));
if (failures.length > 0) process.exit(1);
