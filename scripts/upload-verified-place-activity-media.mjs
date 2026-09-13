#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import { buildVerifiedPlaceActivityMediaIndex } from "./lib/verified-place-activity-media.mjs";

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
if (process.env.VERIFIED_PLACE_ACTIVITY_MEDIA_UPLOAD !== "1") {
  console.error("Refusing Storage writes without VERIFIED_PLACE_ACTIVITY_MEDIA_UPLOAD=1.");
  process.exit(1);
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
if (!url || !serviceKey) throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY/SUPABASE_SERVICE_KEY.");

const media = JSON.parse(fs.readFileSync(path.resolve("scripts/data/verified-place-activity-media.json"), "utf8"));
const validation = buildVerifiedPlaceActivityMediaIndex({ media });
if (validation.issues.length > 0) throw new Error(`Media preflight failed: ${JSON.stringify(validation.issues)}`);

const supabase = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });
// The catalogue already exceeds 100 assets. A truncated listing would make
// legitimate objects look absent and needlessly overwrite them on every run.
const { data: existingObjects, error: existingError } = await supabase.storage.from("place-images").list("activity-media", { limit: 1000 });
if (existingError) throw new Error(`Unable to list activity-media: ${existingError.message}`);
const existingPaths = new Set((existingObjects ?? []).map((object) => `activity-media/${object.name}`));
const overwrite = process.env.VERIFIED_PLACE_ACTIVITY_MEDIA_OVERWRITE === "1";
const pending = [...validation.byKey.values()].filter((item) => overwrite || !existingPaths.has(item.asset_path));

for (const item of pending) {
  const body = fs.readFileSync(path.resolve("public/assets/customer", item.asset_path));
  const { error } = await supabase.storage.from("place-images").upload(item.asset_path, body, { contentType: "image/webp", upsert: true });
  if (error) throw new Error(`${item.asset_path}: ${error.message}`);
  console.log(`uploaded ${item.asset_path}`);
}

console.log(JSON.stringify({ uploaded: pending.length, skippedExisting: validation.byKey.size - pending.length, bucket: "place-images" }, null, 2));
