#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { createClient } from '@supabase/supabase-js';

function loadEnv() {
  for (const filename of ['.env.local', '.env']) {
    const filepath = path.resolve(process.cwd(), filename);
    if (!fs.existsSync(filepath)) continue;
    for (const line of fs.readFileSync(filepath, 'utf8').split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const match = trimmed.match(/^([A-Z_][A-Z0-9_]*)\s*=\s*(.*)$/);
      if (match && !process.env[match[1]]) process.env[match[1]] = match[2].replace(/^['"]|['"]$/g, '');
    }
    break;
  }
}

loadEnv();

if (process.env.PLACE_IMAGES_UPLOAD !== '1') {
  console.error('Refusing to write to remote storage without PLACE_IMAGES_UPLOAD=1.');
  process.exit(1);
}

const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !serviceKey) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY/SUPABASE_SERVICE_KEY.');
  process.exit(1);
}

const BUCKET = 'place-images';
const SOURCE_DIR = path.resolve(process.cwd(), 'public/assets/customer');

if (!fs.existsSync(SOURCE_DIR)) {
  console.error(`Source directory not found: ${SOURCE_DIR}`);
  process.exit(1);
}

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const files = [];
for (const folder of fs.readdirSync(SOURCE_DIR).sort()) {
  const folderPath = path.join(SOURCE_DIR, folder);
  if (!fs.statSync(folderPath).isDirectory()) continue;
  for (const name of fs.readdirSync(folderPath).sort()) {
    if (!name.endsWith('.webp')) continue;
    files.push({ objectPath: `${folder}/${name}`, absolutePath: path.join(folderPath, name) });
  }
}

console.log(`Found ${files.length} .webp files under public/assets/customer/.`);

let uploaded = 0;
const failures = [];

for (const file of files) {
  const body = fs.readFileSync(file.absolutePath);
  const { error } = await supabase.storage.from(BUCKET).upload(file.objectPath, body, {
    contentType: 'image/webp',
    upsert: true,
  });
  if (error) {
    failures.push(`${file.objectPath}: ${error.message}`);
    console.error(`  FAIL ${file.objectPath} — ${error.message}`);
  } else {
    uploaded += 1;
    console.log(`  ok   ${file.objectPath}`);
  }
}

console.log(`\nUploaded ${uploaded}/${files.length} objects to ${BUCKET}.`);

if (failures.length > 0) {
  console.error(`\n${failures.length} failures:`);
  for (const failure of failures) console.error(`  ${failure}`);
  process.exit(1);
}
