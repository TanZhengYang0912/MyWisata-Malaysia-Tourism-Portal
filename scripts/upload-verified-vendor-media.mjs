#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

const ROOT = process.cwd();
const SOURCE_ROOT = path.resolve(ROOT, "public/assets/customer/vendor-images/source-v4");

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

function filesUnder(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) return filesUnder(absolute);
    return /\.(?:jpe?g|png|webp)$/i.test(entry.name) ? [absolute] : [];
  });
}

function contentType(file) {
  const extension = path.extname(file).toLowerCase();
  return extension === ".png" ? "image/png" : extension === ".webp" ? "image/webp" : "image/jpeg";
}

loadEnv();
if (process.env.VERIFIED_VENDOR_MEDIA_UPLOAD !== "1") {
  console.error("Refusing remote media writes without VERIFIED_VENDOR_MEDIA_UPLOAD=1.");
  process.exit(1);
}
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !serviceKey) throw new Error("Missing Supabase environment.");
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });
const files = filesUnder(SOURCE_ROOT);
const startIndex = Math.max(0, Number.parseInt(process.env.VERIFIED_VENDOR_MEDIA_UPLOAD_START || "0", 10) || 0);
const batchSize = Math.max(1, Number.parseInt(process.env.VERIFIED_VENDOR_MEDIA_UPLOAD_BATCH || "36", 10) || 36);
let uploaded = 0;
const failures = [];
for (let start = startIndex; start < files.length; start += batchSize) {
  const batch = files.slice(start, start + batchSize);
  const results = await Promise.all(batch.map(async (file) => {
    const objectPath = path.posix.join("curated-v4", path.relative(SOURCE_ROOT, file).split(path.sep).join("/"));
    const { error } = await supabase.storage.from("vendor-images").upload(objectPath, fs.readFileSync(file), { contentType: contentType(file), cacheControl: "31536000", upsert: true });
    return error ? `${objectPath}: ${error.message}` : null;
  }));
  for (const failure of results) {
    if (failure) failures.push(failure);
    else uploaded += 1;
  }
  console.log(`Uploaded media ${Math.min(start + batch.length, files.length)}/${files.length}`);
}
console.log(JSON.stringify({ files: files.length, startIndex, uploaded, failures }, null, 2));
if (failures.length) process.exit(1);
