#!/usr/bin/env node
/**
 * Creates or repairs real Supabase Auth logins for every public demo profile
 * with a vendor_owner or outlet_manager role. The account list is read from
 * public.users/user_roles so it stays aligned with the current database seed,
 * including vendors and outlets added after the original 28-account sample.
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
const DEMO_VENDOR_ROLES = new Set(['vendor_owner', 'outlet_manager']);

// ── Read every eligible demo profile from the database ──

const { data: users, error: usersErr } = await supabase
  .from('users')
  .select('id, email, full_name, user_roles(roles(name))')
  .like('email', '%@demo.local');
if (usersErr) { console.error('❌ Failed to query demo profiles:', usersErr.message); process.exit(1); }

const accounts = users.flatMap((user) => {
  const roles = (user.user_roles || []).map((assignment) => {
    const relation = Array.isArray(assignment.roles) ? assignment.roles[0] : assignment.roles;
    return relation?.name;
  });
  const role = roles.find((candidate) => DEMO_VENDOR_ROLES.has(candidate));
  if (!role || !user.email) return [];
  return [{
    id: user.id,
    email: user.email,
    full_name: user.full_name,
    kind: role,
  }];
});

if (!accounts.length) {
  console.error('❌ No demo vendor or outlet-manager profiles were found.');
  process.exit(1);
}

const { data: authPage, error: authListError } = await supabase.auth.admin.listUsers({ page: 1, perPage: 1000 });
if (authListError) { console.error('❌ Failed to list existing Auth users:', authListError.message); process.exit(1); }
const authUsersById = new Map((authPage.users || []).map((user) => [user.id, user]));

// ── Create the auth users ──

let created = 0;
let repaired = 0;
let failed  = 0;

for (const a of accounts) {
  const existing = authUsersById.get(a.id);
  const result = existing
    ? await supabase.auth.admin.updateUserById(a.id, {
        password: DEMO_PASSWORD,
        email_confirm: true,
        user_metadata: { full_name: a.full_name },
      })
    : await supabase.auth.admin.createUser({
        id: a.id,
        email: a.email,
        password: DEMO_PASSWORD,
        email_confirm: true,
        user_metadata: { full_name: a.full_name },
      });

  if (result.error) {
    console.error(`  ✗  ${a.email.padEnd(45)} ${result.error.message} — ${a.kind}`);
    failed++;
  } else if (existing) {
    repaired++;
  } else {
    console.log(`  ✓  ${a.email.padEnd(45)} created — ${a.kind}`);
    created++;
  }
}

console.log();
console.log(`Done — profiles: ${accounts.length}, created: ${created}, repaired: ${repaired}, failed: ${failed}`);
console.log();
console.log('Test login at http://localhost:3000/login with password: demo123456');

if (failed > 0) process.exit(1);
