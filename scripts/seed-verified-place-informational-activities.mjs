#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import { buildVerifiedPlaceInformationalActivityPlan } from "./lib/verified-place-informational-activities.mjs";

function loadEnv() {
  for (const filename of [".env.local", ".env"]) {
    const filepath = path.resolve(process.cwd(), filename);
    if (!fs.existsSync(filepath)) continue;
    for (const line of fs.readFileSync(filepath, "utf8").split(/\r?\n/)) {
      const match = line.trim().match(/^([A-Z_][A-Z0-9_]*)\s*=\s*(.*)$/);
      if (match && !process.env[match[1]]) process.env[match[1]] = match[2].replace(/^['"]|['"]$/g, "");
    }
    return;
  }
}

loadEnv();
if (process.env.VERIFIED_PLACE_INFORMATIONAL_ACTIVITY_SEED !== "1") {
  console.error("Refusing remote writes without VERIFIED_PLACE_INFORMATIONAL_ACTIVITY_SEED=1.");
  process.exit(1);
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
if (!url || !serviceKey) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY/SUPABASE_SERVICE_KEY.");
  process.exit(1);
}

const manifestPath = path.resolve("scripts/data/verified-place-informational-activities.json");
const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
const media = JSON.parse(fs.readFileSync(path.resolve("scripts/data/verified-place-activity-media.json"), "utf8"));
const supabase = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });

const { data: places, error: placesError } = await supabase
  .from("places")
  .select("id,slug,level,status")
  .eq("status", "active");
if (placesError) throw new Error(`places read failed: ${placesError.message}`);

const plan = buildVerifiedPlaceInformationalActivityPlan({ manifest, places: places ?? [], media });
if (plan.issues.length > 0) {
  console.error(JSON.stringify({ message: "Verified informational activity preflight failed", issues: plan.issues }, null, 2));
  process.exit(1);
}

for (let start = 0; start < plan.rows.length; start += 100) {
  const { error } = await supabase
    .from("place_informational_activities")
    .upsert(plan.rows.slice(start, start + 100), { onConflict: "place_id,slug" });
  if (error) throw new Error(`place_informational_activities upsert failed: ${error.message}`);
}

console.log(JSON.stringify({ seededPlaceInformationalActivities: plan.rows.length, manifest: path.relative(process.cwd(), manifestPath) }, null, 2));
