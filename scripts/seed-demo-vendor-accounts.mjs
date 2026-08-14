#!/usr/bin/env node
/**
 * Creates real Supabase Auth logins for the 10 demo vendor owners + 18 demo
 * outlet managers (28 accounts total; 2 of them — vendor.owner@demo.local and
 * outlet.manager@demo.local — already exist from scripts/seed-demo-users.mjs
 * and are skipped).
 *
 * Per D8 (docs/plans/2026-08-15-0020-vendor-outlet-manager-accounts.md), the
 * auth user ids are NOT recomputed here — they are read back from
 * public.vendors.owner_id / public.outlet_managers.user_id so they can never
 * drift from what the Phase 1/2 migrations actually wrote.
 *
 * Requires:
 *   NEXT_PUBLIC_SUPABASE_URL     — from Supabase Dashboard → Settings → API
 *   SUPABASE_SERVICE_ROLE_KEY    — from same page (NEVER expose to client)
 *
 * Usage:
 *   npm run seed:demo-vendor-accounts
 *
 * Env vars are auto-loaded from .env.local or .env.
 * Idempotent: existing users are skipped, not treated as failures.
 */

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
    console.log(`ℹ  Loaded env from ${filename}`);
    break;
  }
}

loadEnv();

if (process.env.DEMO_VENDOR_ACCOUNTS !== '1') {
  console.error('Refusing to create auth users without DEMO_VENDOR_ACCOUNTS=1.');
  process.exit(1);
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

const VENDOR_SLUGS = [
  'penang-road-famous-teochew-chendul', 'ghee-hiang', 'cheong-fatt-tze-blue-mansion', 'penang-hill-corporation',
  'melaka-river-cruise-vendor', 'kooya-handicraft', 'hotel-puri', 'atlas-travel-services',
  'heritage-hotel-cameron-highlands', 'highlands-skyway-operations',
];

const OUTLET_SLUGS = [
  'chendul-gurney-plaza', 'chendul-keng-kwee', 'chendul-queensbay', 'chendul-sunway-carnival',
  'ghee-hiang-beach', 'ghee-hiang-burma', 'ghee-hiang-macalister', 'ghee-hiang-sunshine-central',
  'blue-mansion-leith', 'op-penang-hill', 'op-river-cruise-jetty', 'op-river-cruise-tun-ali',
  'retail-kooya-hang-jebat', 'retail-kooya-tukang-emas', 'accom-hotel-puri', 'guide-atlas-travel',
  'accom-heritage-hotel-cameron', 'op-skyway-station',
];

// ── Read the real ids/emails/names back from the DB (D8) ──

const { data: vendors, error: vendorsErr } = await supabase
  .from('vendors')
  .select('slug, owner_id')
  .in('slug', VENDOR_SLUGS);
if (vendorsErr) { console.error('❌ Failed to query vendors:', vendorsErr.message); process.exit(1); }
if (vendors.length !== VENDOR_SLUGS.length) {
  const found = new Set(vendors.map((v) => v.slug));
  console.error('❌ Missing vendors:', VENDOR_SLUGS.filter((s) => !found.has(s)));
  process.exit(1);
}

const { data: outlets, error: outletsErr } = await supabase
  .from('outlets')
  .select('id, slug')
  .in('slug', OUTLET_SLUGS);
if (outletsErr) { console.error('❌ Failed to query outlets:', outletsErr.message); process.exit(1); }
if (outlets.length !== OUTLET_SLUGS.length) {
  const found = new Set(outlets.map((o) => o.slug));
  console.error('❌ Missing outlets:', OUTLET_SLUGS.filter((s) => !found.has(s)));
  process.exit(1);
}

const outletBySlug = new Map(outlets.map((o) => [o.slug, o]));
const outletIds = outlets.map((o) => o.id);

const { data: managers, error: managersErr } = await supabase
  .from('outlet_managers')
  .select('outlet_id, user_id')
  .in('outlet_id', outletIds);
if (managersErr) { console.error('❌ Failed to query outlet_managers:', managersErr.message); process.exit(1); }
if (managers.length !== OUTLET_SLUGS.length) {
  const found = new Set(managers.map((m) => m.outlet_id));
  const missing = outlets.filter((o) => !found.has(o.id)).map((o) => o.slug);
  console.error('❌ Missing outlet_managers rows for outlets:', missing);
  process.exit(1);
}
const managerByOutletId = new Map(managers.map((m) => [m.outlet_id, m]));

const ownerIds = vendors.map((v) => v.owner_id);
const managerUserIds = managers.map((m) => m.user_id);
const allUserIds = [...ownerIds, ...managerUserIds];

const { data: users, error: usersErr } = await supabase
  .from('users')
  .select('id, email, full_name')
  .in('id', allUserIds);
if (usersErr) { console.error('❌ Failed to query users:', usersErr.message); process.exit(1); }
if (users.length !== allUserIds.length) {
  const found = new Set(users.map((u) => u.id));
  console.error('❌ Missing public.users rows for ids:', allUserIds.filter((id) => !found.has(id)));
  process.exit(1);
}
const userById = new Map(users.map((u) => [u.id, u]));

// ── Build the 28-account list ──

const accounts = [];

for (const v of vendors) {
  const u = userById.get(v.owner_id);
  accounts.push({ id: u.id, email: u.email, full_name: u.full_name, kind: `vendor owner (${v.slug})` });
}

for (const slug of OUTLET_SLUGS) {
  const outlet = outletBySlug.get(slug);
  const m = managerByOutletId.get(outlet.id);
  const u = userById.get(m.user_id);
  accounts.push({ id: u.id, email: u.email, full_name: u.full_name, kind: `outlet manager (${slug})` });
}

// ── Create the auth users ──

let created = 0;
let skipped = 0;
let failed  = 0;

for (const a of accounts) {
  const { data, error } = await supabase.auth.admin.createUser({
    id:            a.id,
    email:         a.email,
    password:      DEMO_PASSWORD,
    email_confirm: true,
    user_metadata: { full_name: a.full_name },
  });

  if (error) {
    const msg = error.message.toLowerCase();
    if (msg.includes('already') || msg.includes('duplicate')) {
      console.log(`  ⊖  ${a.email.padEnd(45)} already exists — ${a.kind}`);
      skipped++;
    } else {
      console.error(`  ✗  ${a.email.padEnd(45)} ${error.message} — ${a.kind}`);
      failed++;
    }
  } else {
    console.log(`  ✓  ${a.email.padEnd(45)} created (${data.user?.id?.slice(0, 8)}…) — ${a.kind}`);
    created++;
  }
}

console.log();
console.log(`Done — created: ${created}, skipped: ${skipped}, failed: ${failed}`);
console.log();
console.log('Test login at http://localhost:3000/login with password: demo123456');

if (failed > 0) process.exit(1);
