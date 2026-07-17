#!/usr/bin/env node
/**
 * Live verification for migration 039 (affiliate_links RLS insert fix).
 *
 * Same class of test as replay-kyc-security-db.mjs — real Supabase Auth
 * sessions and real RPC calls against the live project, not the
 * network-free vitest suite. Runs against the SAME shared live project as
 * the rest of the app (no disposable test DB is configured in this repo),
 * so every throwaway user/row this script creates is deleted at the end.
 *
 * Never fakes tier/kyc_status via a direct write — protect_verification_fields()
 * blocks that by design (migration 20260715000030). Deliberately does NOT
 * call promote_to_phone_verified() or promote_to_profile_complete() — both
 * are owned by the auth/phone module and (as of this session) run a stale
 * pre-set_config() definition; this script must not depend on or work
 * around that owner's bug. Instead it goes straight to 'profile_complete'
 * in one call via admin_set_tier(userId, 'profile_complete', reason) — a
 * generic, already-existing, admin-gated, audit-logged escape hatch that
 * writes the `tier` column directly, which is exactly what migration 039's
 * RLS policy checks. For the KYC path, a real kyc_submissions row + the
 * real admin_review_kyc RPC is still used — both called via the real seeded
 * Super Admin demo account (admin@demo.local / demo123456 — already used
 * by this repo's own committed e2e suite,
 * tests/e2e/admin-user-management.spec.ts). Deliberately does NOT mint or
 * elevate any throwaway admin account.
 *
 * Usage: node scripts/verify-affiliate-links-rls.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { createClient } from '@supabase/supabase-js';

for (const filename of ['.env.local', '.env']) {
  const file = path.resolve(process.cwd(), filename);
  if (!fs.existsSync(file)) continue;
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const match = line.trim().match(/^([A-Z_][A-Z0-9_]*)\s*=\s*(.*)$/);
    if (match && !process.env[match[1]]) process.env[match[1]] = match[2].replace(/^['"]|['"]$/g, '');
  }
  break;
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !anonKey || !serviceKey) {
  throw new Error('NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY are all required.');
}

const service = createClient(url, serviceKey, { auth: { persistSession: false } });

const ADMIN_EMAIL = 'admin@demo.local';
const ADMIN_PASS = 'demo123456';

const results = [];
function record(name, pass, detail) {
  results.push({ name, pass, detail });
  console.log(`${pass ? '✅ PASS' : '❌ FAIL'} — ${name}${detail ? `: ${detail}` : ''}`);
}

const PASSWORD = 'RlsVerify!2026';
const createdUserIds = [];

async function createTestUser(label) {
  const email = `rls-verify-${label}-${Date.now()}@demo.local`;
  const { data, error } = await service.auth.admin.createUser({ email, password: PASSWORD, email_confirm: true });
  if (error) throw new Error(`createUser(${label}): ${error.message}`);
  createdUserIds.push(data.user.id);
  // handle_new_auth_user() runs on an AFTER INSERT trigger for auth.users;
  // poll briefly for the public.users row to land before proceeding.
  for (let i = 0; i < 20; i++) {
    const { data: row } = await service.from('users').select('id').eq('id', data.user.id).maybeSingle();
    if (row) break;
    await new Promise((r) => setTimeout(r, 250));
  }
  return { id: data.user.id, email };
}

async function signIn(email, password) {
  const client = createClient(url, anonKey, { auth: { persistSession: false } });
  const { error } = await client.auth.signInWithPassword({ email, password });
  if (error) throw new Error(`signIn(${email}): ${error.message}`);
  return client;
}

// Deliberately does NOT call promote_to_phone_verified or
// promote_to_profile_complete — both are owned by the auth/phone module and
// (as of this session) are running a stale pre-set_config() definition that
// this script must not depend on or work around by touching that owner's
// code. admin_set_tier() is a generic, already-existing, admin-gated,
// audit-logged escape hatch that writes the `tier` column directly — the
// exact column migration 039's RLS policy checks — so going straight to
// 'profile_complete' in one call is a valid isolation of this test from the
// auth module's current bug.
async function promoteToProfileComplete(adminClient, userId) {
  const { error } = await adminClient.rpc('admin_set_tier', {
    p_user_id: userId,
    p_tier: 'profile_complete',
    p_reason: 'scripts/verify-affiliate-links-rls.mjs test setup',
  });
  if (error) throw new Error(`admin_set_tier(profile_complete): ${error.message}`);
}

async function main() {
  // Signed in once, reused for admin_set_tier (Cases 2/3) and admin_review_kyc (Case 3).
  const clientAdmin = await signIn(ADMIN_EMAIL, ADMIN_PASS);

  // ---- Case 1: profile-incomplete user, direct insert must be REJECTED ----
  console.log('\n=== Case 1: profile-incomplete user -> direct affiliate_links insert ===');
  const userA = await createTestUser('incomplete');
  const clientA = await signIn(userA.email, PASSWORD);
  const { data: profileA } = await service.from('users').select('tier, kyc_status').eq('id', userA.id).single();
  console.log(`  user A tier=${profileA.tier} kyc_status=${profileA.kyc_status}`);
  const { data: insertA, error: errorA } = await clientA
    .from('affiliate_links')
    .insert({ user_id: userA.id, affiliate_code: 'AF-RLSVR1' })
    .select();
  if (!errorA) {
    // Case 1 failing loudly matters more than tidy cleanup order -- drop
    // the row immediately if it snuck through, so the drift is visible but
    // doesn't pollute affiliate_links.
    await service.from('affiliate_links').delete().eq('user_id', userA.id);
  }
  record(
    'Case 1: RLS rejects profile-incomplete direct insert',
    !!errorA,
    errorA ? `${errorA.code} ${errorA.message}` : `insert unexpectedly succeeded: ${JSON.stringify(insertA)}`
  );

  // ---- Case 2: profile-complete user, direct insert must SUCCEED ----
  console.log('\n=== Case 2: profile-complete user -> direct affiliate_links insert ===');
  const userB = await createTestUser('complete');
  const clientB = await signIn(userB.email, PASSWORD);
  await promoteToProfileComplete(clientAdmin, userB.id);
  const { data: profileB } = await service.from('users').select('tier, kyc_status').eq('id', userB.id).single();
  console.log(`  user B tier=${profileB.tier} kyc_status=${profileB.kyc_status}`);
  const { data: insertB, error: errorB } = await clientB
    .from('affiliate_links')
    .insert({ user_id: userB.id, affiliate_code: 'AF-RLSVR2' })
    .select();
  record(
    'Case 2: RLS allows profile-complete direct insert',
    !errorB && insertB?.length === 1,
    errorB ? `${errorB.code} ${errorB.message}` : undefined
  );

  // ---- Case 3: gen_affiliate_code() via admin_review_kyc still auto-creates a link ----
  console.log('\n=== Case 3: KYC-approval auto-creation (gen_affiliate_code via admin_review_kyc) ===');
  const userC = await createTestUser('kyc');
  const clientC = await signIn(userC.email, PASSWORD);
  await promoteToProfileComplete(clientAdmin, userC.id);

  const { error: subErr } = await service.from('kyc_submissions').insert({
    user_id: userC.id,
    ic_hash: `rls-verify-${userC.id}`,
    document_type: 'national_id',
    status: 'pending',
  });
  if (subErr) throw new Error(`kyc_submissions seed insert: ${subErr.message}`);

  const { data: preLink } = await service.from('affiliate_links').select('id').eq('user_id', userC.id).maybeSingle();
  console.log(`  link before approval: ${preLink ? preLink.id : 'none'}`);

  const { error: reviewErr } = await clientAdmin.rpc('admin_review_kyc', {
    p_user_id: userC.id,
    p_action: 'approve',
    p_reason_code: null,
    p_reason_detail: null,
  });
  if (reviewErr) console.log(`  admin_review_kyc error: ${reviewErr.code ?? ''} ${reviewErr.message}`);

  const { data: postLink } = await service.from('affiliate_links').select('id, affiliate_code').eq('user_id', userC.id).maybeSingle();
  console.log(`  link after approval: ${postLink ? `${postLink.id} (${postLink.affiliate_code})` : 'none'}`);
  record('Case 3: gen_affiliate_code() still auto-creates a link on KYC approval', !reviewErr && !!postLink, reviewErr?.message);
}

try {
  await main();
} catch (err) {
  console.error('\nScript aborted with an unexpected error:', err);
} finally {
  console.log('\n=== cleanup ===');
  for (const id of createdUserIds) {
    await service.from('affiliate_links').delete().eq('user_id', id);
    await service.from('preference_survey_responses').delete().eq('user_id', id);
    await service.from('kyc_submissions').delete().eq('user_id', id);
    await service.auth.admin.deleteUser(id).catch(() => {});
    // public.users.id has NO foreign key to auth.users (001_initial_schema.sql:16
    // — just a same-value comment) and no delete trigger/cascade either, so
    // deleting the auth user above does NOT remove this row — confirmed by a
    // real orphaned-row leak from an earlier run of this exact script. Must
    // be deleted explicitly, not assumed to cascade.
    await service.from('users').delete().eq('id', id);
  }
  console.log(`deleted ${createdUserIds.length} throwaway users and their rows`);
}

console.log('\n=== summary ===');
for (const r of results) console.log(`${r.pass ? 'PASS' : 'FAIL'} - ${r.name}`);
const allPass = results.length === 3 && results.every((r) => r.pass);
if (!allPass) process.exitCode = 1;
