#!/usr/bin/env node
// Uploads the 13 demo event photos to event-posters/demo-events/.
// Plan: docs/plans/2026-11-15-1254-demo-event-content-refresh.md (Phase 1).
// Usage: node scripts/upload-demo-event-photos.mjs <photo-folder> [--apply]
// Without --apply it only checks the files and prints the target URLs.

import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

const BUCKET = "event-posters";
const PREFIX = "demo-events";
// Phase 2 stores full URLs on this host, so uploading anywhere else would leave broken links.
const EXPECTED_URL = "https://ncdlaehknicabzjqskvk.supabase.co";
const MAX_BYTES = 300 * 1024;
const FILES = [
  "event-01-popup-fiesta-poster.jpg",
  "event-02-coming-soon-craft-market-poster.jpg",
  "event-03-heritage-walk-kl-poster.jpg",
  "event-04-hiap-joo-stall.jpg",
  "event-05-cameron-valley-tea-stall.jpg",
  "event-06-desa-murni-batik-stall.jpg",
  "event-07-tanoti-weavers-stall.jpg",
  "event-08-jonker-88-stall.jpg",
  "event-09-hameediyah-stall.jpg",
  "event-10-batik-painting-workshop.jpg",
  "event-11-batik-stamping-demo.jpg",
  "event-12-songket-weaving-tryout.jpg",
  "event-13-baba-nyonya-laksa.jpg",
];

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

const [folder, flag] = process.argv.slice(2);
const apply = flag === "--apply";
if (!folder || !fs.existsSync(folder)) throw new Error(`Photo folder not found: ${folder ?? "(none given)"}`);

const files = FILES.map((name) => {
  const filepath = path.join(folder, name);
  if (!fs.existsSync(filepath)) throw new Error(`Missing photo: ${name}`);
  const { size } = fs.statSync(filepath);
  if (size > MAX_BYTES) throw new Error(`${name} is ${size} bytes, over ${MAX_BYTES}`);
  return { name, filepath, size };
});

loadEnv();
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
if (!url || !serviceKey) throw new Error("Missing Supabase service credentials.");
if (url.replace(/\/+$/, "") !== EXPECTED_URL) throw new Error(`Refusing to upload to ${url}; expected ${EXPECTED_URL}.`);

const supabase = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });
for (const file of files) {
  const objectPath = `${PREFIX}/${file.name}`;
  if (apply) {
    // upsert on a fixed path: a rerun replaces the same object instead of adding a copy.
    const { error } = await supabase.storage.from(BUCKET).upload(objectPath, fs.readFileSync(file.filepath), {
      contentType: "image/jpeg",
      cacheControl: "31536000",
      upsert: true,
    });
    if (error) throw new Error(`${file.name}: ${error.message}`);
  }
  console.log(`${apply ? "uploaded" : "would upload"} ${file.size} B  ${EXPECTED_URL}/storage/v1/object/public/${BUCKET}/${objectPath}`);
}
if (!apply) console.log("Dry run. Pass --apply to upload.");
