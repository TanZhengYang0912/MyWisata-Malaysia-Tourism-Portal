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

if (process.env.REMOTE_DEMO_SEED !== '1') {
  console.error('Refusing to update a remote database without REMOTE_DEMO_SEED=1.');
  process.exit(1);
}

const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !serviceKey) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY/SUPABASE_SERVICE_KEY.');
  process.exit(1);
}

const DEMO_VENDOR_SLUGS = ['rasa-malaysia', 'batik-nusantara', 'borneo-wild'];
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const { data, error } = await supabase
  .from('vendors')
  .update({ logo_url: null, cover_url: null })
  .in('slug', DEMO_VENDOR_SLUGS)
  .select('slug');

if (error) {
  console.error(error.message);
  process.exit(1);
}

console.log(`Cleared vendor identity media for ${(data ?? []).map((vendor) => vendor.slug).join(', ') || 'no matching demo vendors'}.`);
