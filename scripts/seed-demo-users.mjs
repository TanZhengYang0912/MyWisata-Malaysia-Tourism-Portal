#!/usr/bin/env node
/**
 * Creates the core demo auth users with specific UUIDs so seed.sql lines up.
 *
 * Requires:
 *   NEXT_PUBLIC_SUPABASE_URL     — from Supabase Dashboard → Settings → API
 *   SUPABASE_SERVICE_ROLE_KEY    — from same page (NEVER expose to client)
 *
 * Usage:
 *   npm run seed:users
 *
 * Env vars are auto-loaded from .env.local or .env (whichever exists first).
 * Idempotent: existing users are skipped.
 * The auth trigger auto-populates public.users + wallet + customer role.
 * Run supabase/seed.sql AFTER this succeeds.
 */

import fs from 'node:fs';
import path from 'node:path';
import { createClient } from '@supabase/supabase-js';

// ── Load env from .env.local or .env (Node script doesn't inherit Next.js loader) ──
for (const filename of ['.env.local', '.env']) {
  const filepath = path.resolve(process.cwd(), filename);
  if (fs.existsSync(filepath)) {
    const content = fs.readFileSync(filepath, 'utf8');
    for (const line of content.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const match = trimmed.match(/^([A-Z_][A-Z0-9_]*)\s*=\s*(.*)$/);
      if (match && !process.env[match[1]]) {
        // Strip surrounding quotes if present
        process.env[match[1]] = match[2].replace(/^['"]|['"]$/g, '');
      }
    }
    console.log(`ℹ  Loaded env from ${filename}`);
    break;   // stop after the first file found
  }
}

const url        = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceKey) {
  console.error('❌ Missing env vars. Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const DEMO_PASSWORD = 'demo123456';

const users = [
  { id: 'aaaaaaaa-0000-0000-0000-000000000001', email: 'admin@demo.local',           label: 'Super Admin' },
  { id: 'aaaaaaaa-0000-0000-0000-000000000002', email: 'approver@demo.local',        label: 'Wallet Approver' },
  { id: 'aaaaaaaa-0000-0000-0000-000000000003', email: 'vendor.owner@demo.local',    label: 'Vendor Owner' },
  { id: 'aaaaaaaa-0000-0000-0000-000000000004', email: 'outlet.manager@demo.local',  label: 'Outlet Manager' },
  { id: 'aaaaaaaa-0000-0000-0000-000000000005', email: 'customer1@demo.local',       label: 'Customer Alice' },
  { id: 'aaaaaaaa-0000-0000-0000-000000000006', email: 'customer2@demo.local',       label: 'Customer Bob' },
  { id: 'aaaaaaaa-0000-0000-0000-000000000007', email: 'customer3@demo.local',       label: 'Customer Carol' },
  { id: 'aaaaaaaa-0000-0000-0000-000000000008', email: 'customer4@demo.local',       label: 'Customer Dave' },
  { id: 'aaaaaaaa-0000-0000-0000-000000000014', email: 'moderator@demo.local',       label: 'Platform Admin' },
];

let created = 0;
let skipped = 0;
let failed  = 0;

for (const u of users) {
  const { data, error } = await supabase.auth.admin.createUser({
    id:            u.id,
    email:         u.email,
    password:      DEMO_PASSWORD,
    email_confirm: true,
    user_metadata: { full_name: u.label },
  });

  if (error) {
    const msg = error.message.toLowerCase();
    if (msg.includes('already') || msg.includes('duplicate')) {
      console.log(`  ⊖  ${u.email.padEnd(30)} already exists`);
      skipped++;
    } else {
      console.error(`  ✗  ${u.email.padEnd(30)} ${error.message}`);
      failed++;
    }
  } else {
    console.log(`  ✓  ${u.email.padEnd(30)} created (${data.user?.id?.slice(0, 8)}…)`);
    created++;
  }
}

console.log();
console.log(`Done — created: ${created}, skipped: ${skipped}, failed: ${failed}`);
console.log();
console.log('Next steps:');
console.log('  1. Run seed.sql in Supabase SQL Editor (or `supabase db reset` if using local CLI)');
console.log('  2. Test login at http://localhost:3000/login with password: demo123456');

if (failed > 0) process.exit(1);
