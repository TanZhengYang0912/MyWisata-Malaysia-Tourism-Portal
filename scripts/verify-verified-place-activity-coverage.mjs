#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import { buildVerifiedPlaceAccessPlan } from "./lib/verified-place-accesses.mjs";
import { buildVerifiedPlaceInformationalActivityPlan } from "./lib/verified-place-informational-activities.mjs";
import { buildVerifiedPlaceActivityCoverage } from "./lib/verified-place-activity-coverage.mjs";

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
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
if (!url || !key) throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY.");

const accessManifest = JSON.parse(fs.readFileSync(path.resolve("scripts/data/verified-place-accesses.json"), "utf8"));
const informationalManifest = JSON.parse(fs.readFileSync(path.resolve("scripts/data/verified-place-informational-activities.json"), "utf8"));
const media = JSON.parse(fs.readFileSync(path.resolve("scripts/data/verified-place-activity-media.json"), "utf8"));
const supabase = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
const [{ data: places, error: placesError }, { data: accesses, error: accessesError }, { data: informationalActivities, error: informationalError }] = await Promise.all([
  supabase.from("places").select("id,slug,name,state,level,status").eq("status", "active"),
  supabase.from("place_accesses").select("place_id,slug,status").eq("status", "active"),
  supabase.from("place_informational_activities").select("place_id,slug,status").eq("status", "active"),
]);
if (placesError || accessesError) throw placesError ?? accessesError;
const informationalSchemaPending = informationalError?.code === "PGRST205" || informationalError?.code === "42P01";
if (informationalError && !informationalSchemaPending) throw informationalError;

const accessPlan = buildVerifiedPlaceAccessPlan({ manifest: accessManifest, places: places ?? [], media });
const informationalPlan = buildVerifiedPlaceInformationalActivityPlan({ manifest: informationalManifest, places: places ?? [], media });
const invalidManifestEntries = [...accessPlan.issues, ...informationalPlan.issues];
const persistedCoverage = buildVerifiedPlaceActivityCoverage({
  places: places ?? [],
  accessRows: accesses ?? [],
  informationalRows: informationalActivities ?? [],
});
const manifestCoverage = buildVerifiedPlaceActivityCoverage({
  places: places ?? [],
  accessRows: accessPlan.rows,
  informationalRows: informationalPlan.rows,
});

console.log(JSON.stringify({
  activePois: persistedCoverage.activePois,
  verifiedFreeRows: accesses?.length ?? 0,
  verifiedInformationalRows: informationalActivities?.length ?? 0,
  informationalSchemaPending,
  activityTotal: persistedCoverage.activityTotal,
  belowMinimumCount: persistedCoverage.belowMinimumCount,
  belowMinimum: persistedCoverage.belowMinimum,
  stateCoverage: persistedCoverage.stateCoverage,
  manifestActivityTotal: manifestCoverage.activityTotal,
  manifestBelowMinimumCount: manifestCoverage.belowMinimumCount,
  manifestBelowMinimum: manifestCoverage.belowMinimum,
  manifestStateCoverage: manifestCoverage.stateCoverage,
  invalidManifestCount: invalidManifestEntries.length,
  invalidManifestEntries,
}, null, 2));

if (invalidManifestEntries.length > 0 || manifestCoverage.belowMinimumCount > 0 || persistedCoverage.belowMinimumCount > 0) process.exitCode = 1;
