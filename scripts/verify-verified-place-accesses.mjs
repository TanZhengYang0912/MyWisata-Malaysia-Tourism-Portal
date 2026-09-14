#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import { buildVerifiedPlaceAccessPlan } from "./lib/verified-place-accesses.mjs";

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

const manifest = JSON.parse(fs.readFileSync(path.resolve("scripts/data/verified-place-accesses.json"), "utf8"));
const media = JSON.parse(fs.readFileSync(path.resolve("scripts/data/verified-place-activity-media.json"), "utf8"));
const supabase = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
const [{ data: places, error: placesError }, { data: accesses, error: accessesError }] = await Promise.all([
  supabase.from("places").select("id,slug,level,status").eq("status", "active"),
  supabase.from("place_accesses").select("place_id,slug,source_url,image_source_url,image_path,status").eq("status", "active"),
]);
if (placesError) throw new Error(`places read failed: ${placesError.message}`);
if (accessesError) throw new Error(`place_accesses read failed: ${accessesError.message}`);

const plan = buildVerifiedPlaceAccessPlan({ manifest, places: places ?? [], media });
const poiBySlug = new Map((places ?? []).filter((place) => place.level === "poi").map((place) => [place.slug, place]));
const persistedKeys = new Set((accesses ?? []).map((access) => `${access.place_id}:${access.slug}`));
const missingPersisted = plan.rows.filter((row) => !persistedKeys.has(`${row.place_id}:${row.slug}`)).map((row) => row.slug);
const expectedByKey = new Map(plan.rows.map((row) => [`${row.place_id}:${row.slug}`, row]));
const inconsistentMedia = (accesses ?? []).flatMap((access) => {
  const expected = expectedByKey.get(`${access.place_id}:${access.slug}`);
  if (!expected) return [];
  return access.image_path === expected.image_path && access.image_source_url === expected.image_source_url
    ? []
    : [{ slug: access.slug, actualImagePath: access.image_path, expectedImagePath: expected.image_path }];
});
const manifestPlaceSlugs = new Set(manifest.accesses.map((access) => access.place_slug));
const uncuratedPoiSlugs = [...poiBySlug.keys()].filter((slug) => !manifestPlaceSlugs.has(slug));
const report = {
  activePois: poiBySlug.size,
  manifestEntries: manifest.accesses.length,
  persistedAccesses: accesses?.length ?? 0,
  invalidManifestEntries: plan.issues,
  missingPersisted,
  inconsistentMedia,
  uncuratedPoiSlugs,
};
console.log(JSON.stringify(report, null, 2));
if (plan.issues.length > 0 || missingPersisted.length > 0 || inconsistentMedia.length > 0 || uncuratedPoiSlugs.length > 0) process.exitCode = 1;
