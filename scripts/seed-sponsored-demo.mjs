#!/usr/bin/env node
/**
 * Seed a small, visible, idempotent set of Sponsored discovery placements.
 *
 * This script intentionally uses the service role and is guarded separately
 * from the larger remote demo seed so it cannot be run by accident.
 */

import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import { stableUuid } from "./lib/vendor-customer-demo.mjs";

const MAX_DEMO_PLACEMENTS = 4;
const DAY_MS = 24 * 60 * 60 * 1000;

function loadEnv() {
  for (const filename of [".env.local", ".env"]) {
    const filepath = path.resolve(process.cwd(), filename);
    if (!fs.existsSync(filepath)) continue;

    for (const line of fs.readFileSync(filepath, "utf8").split(/\r?\n/)) {
      const match = line.trim().match(/^([A-Z_][A-Z0-9_]*)\s*=\s*(.*)$/);
      if (match && !process.env[match[1]]) {
        process.env[match[1]] = match[2].replace(/^['"]|['"]$/g, "");
      }
    }
    break;
  }
}

loadEnv();

if (process.env.SPONSORED_DEMO_SEED !== "1") {
  console.error("Refusing to seed Sponsored demo placements without SPONSORED_DEMO_SEED=1.");
  process.exit(1);
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
if (!url || !serviceKey) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY/SUPABASE_SERVICE_KEY.");
  process.exit(1);
}

const supabase = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const { data: eligibleProducts, error: productError } = await supabase
  .from("products")
  .select("id,name,outlet_id,outlet_offers(outlet_id,status)")
  .eq("status", "active")
  .eq("review_status", "approved")
  .not("cover_url", "is", null)
  .order("name")
  .limit(40);

if (productError) throw productError;

const products = (eligibleProducts ?? [])
  .filter((product) => (
    product.outlet_id || product.outlet_offers?.some((offer) => offer.status === "active")
  ))
  .slice(0, MAX_DEMO_PLACEMENTS);
if (products.length === 0) {
  throw new Error("No active, approved products with cover images are available for Sponsored demo placements.");
}

const now = new Date();
const startsAt = new Date(now.getTime() - DAY_MS).toISOString();
const endsAt = new Date(now.getTime() + 365 * DAY_MS).toISOString();
const rows = products.map((product, index) => ({
  id: stableUuid(`sponsored-demo:${product.id}`),
  product_id: product.id,
  state: null,
  category_slug: null,
  starts_at: startsAt,
  ends_at: endsAt,
  priority: 400 - index,
  status: "approved",
  updated_at: now.toISOString(),
}));

const { data: placements, error: placementError } = await supabase
  .from("sponsored_discovery_placements")
  .upsert(rows, { onConflict: "id" })
  .select("id,product_id,status,starts_at,ends_at,priority");

if (placementError) throw placementError;

console.log(JSON.stringify({
  message: "Sponsored demo placements seeded",
  count: placements?.length ?? 0,
  products: products.map((product) => product.name),
}, null, 2));
