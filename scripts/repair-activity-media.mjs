#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import { ACTIVITY_MEDIA_CORRECTIONS, ACTIVITY_NAME_CORRECTIONS } from "./lib/activity-media-consistency.mjs";

function loadEnv() {
  for (const filename of [".env.local", ".env"]) {
    const filepath = path.resolve(process.cwd(), filename);
    if (!fs.existsSync(filepath)) continue;
    for (const line of fs.readFileSync(filepath, "utf8").split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const match = trimmed.match(/^([A-Z_][A-Z0-9_]*)\s*=\s*(.*)$/);
      if (match && !process.env[match[1]]) process.env[match[1]] = match[2].replace(/^['"]|['"]$/g, "");
    }
    break;
  }
}

loadEnv();

if (process.env.ACTIVITY_MEDIA_WRITE !== "1") {
  console.error("Refusing to update remote catalogue without ACTIVITY_MEDIA_WRITE=1.");
  process.exit(1);
}

const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !serviceKey) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY/SUPABASE_SERVICE_KEY.");
  process.exit(1);
}

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const { data: rows, error: fetchError } = await supabase
  .from("products")
  .select("id,slug,name,cover_url,status,review_status,categories(slug)")
  .eq("status", "active")
  .eq("review_status", "approved");

if (fetchError) throw fetchError;

const activityRows = (rows ?? []).filter((row) => ["activity", "experience"].includes(row.categories?.slug));
const missing = activityRows.filter((row) => !String(row.cover_url ?? "").trim() && !ACTIVITY_MEDIA_CORRECTIONS[row.slug]);
if (missing.length > 0) {
  throw new Error(`Unmapped activity products without cover_url: ${missing.map((row) => row.slug).join(", ")}`);
}

let updated = 0;
for (const [slug, filename] of Object.entries(ACTIVITY_MEDIA_CORRECTIONS)) {
  const patch = { cover_url: `/assets/customer/products/${filename}` };
  if (ACTIVITY_NAME_CORRECTIONS[slug]) patch.name = ACTIVITY_NAME_CORRECTIONS[slug];

  const { error } = await supabase
    .from("products")
    .update(patch)
    .eq("slug", slug)
    .eq("status", "active")
    .eq("review_status", "approved");
  if (error) throw new Error(`${slug}: ${error.message}`);
  updated += 1;
  console.log(`updated ${slug}`);
}

console.log(`Updated ${updated} activity/experience products; validated ${activityRows.length} scoped products.`);
