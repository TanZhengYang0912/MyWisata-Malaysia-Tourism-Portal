#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

const ROOT = process.cwd();
const DATA_PATH = path.resolve(ROOT, "scripts/data/verified-ghee-hiang-products.json");

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

loadEnv();
if (process.env.VERIFIED_GHEE_MEDIA_SYNC !== "1") {
  console.error("Refusing remote storage writes without VERIFIED_GHEE_MEDIA_SYNC=1.");
  process.exit(1);
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
if (!url || !serviceKey) throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or service role key.");

const data = JSON.parse(fs.readFileSync(DATA_PATH, "utf8"));
const supabase = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });
const issues = [];

const { data: vendor, error: vendorError } = await supabase.from("vendors").select("id,name,status").eq("id", data.vendor.id).maybeSingle();
if (vendorError) throw new Error(`vendor read failed: ${vendorError.message}`);
if (!vendor || vendor.name !== data.vendor.name || vendor.status !== "approved") throw new Error("Ghee Hiang vendor identity/status does not match the verified manifest.");

const { data: products, error: productError } = await supabase.from("products").select("id,name,slug,cover_url,status,review_status").in("id", data.products.map((product) => product.id));
if (productError) throw new Error(`product read failed: ${productError.message}`);
const productById = new Map((products ?? []).map((product) => [product.id, product]));
for (const product of data.products) {
  const actual = productById.get(product.id);
  const asset = path.resolve(ROOT, "public", product.asset_path.replace(/^\//, ""));
  if (!actual || actual.name !== product.name || actual.slug !== product.slug || actual.status !== "active" || actual.review_status !== "approved") issues.push(`product identity/status mismatch: ${product.slug}`);
  if (!fs.existsSync(asset)) issues.push(`missing local asset: ${product.asset_path}`);
  else if (crypto.createHash("sha256").update(fs.readFileSync(asset)).digest("hex") !== product.sha256) issues.push(`sha256 mismatch: ${product.slug}`);
}
if (issues.length > 0) throw new Error(`Verified Ghee media preflight failed: ${issues.join("; ")}`);

for (const product of data.products) {
  const filename = path.basename(product.asset_path);
  const body = fs.readFileSync(path.resolve(ROOT, "public", product.asset_path.replace(/^\//, "")));
  const { error } = await supabase.storage.from("product-images").upload(`products/${filename}`, body, { contentType: "image/jpeg", upsert: true });
  if (error) throw new Error(`product image upload failed for ${product.slug}: ${error.message}`);
  const { error: productError } = await supabase.from("products").update({ cover_url: filename }).eq("id", product.id);
  if (productError) throw new Error(`product cover update failed for ${product.slug}: ${productError.message}`);
}

console.log(JSON.stringify({ message: "Verified Ghee Hiang product media synced", vendor: vendor.name, products: data.products.length, outlets: data.outlets.length }, null, 2));
