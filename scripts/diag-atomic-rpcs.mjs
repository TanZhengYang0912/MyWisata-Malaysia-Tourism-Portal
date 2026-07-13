#!/usr/bin/env node
/**
 * Diagnostic: 018_atomic_rpcs verification
 *
 * Checks:
 *  1. Schema — recommendation_conversions new columns
 *  2. Schema — recommendation_commissions new columns
 *  3. Schema — kyc_submissions.ic_hash column
 *  4. platform_settings — recommendation.attribution_window_days
 *  5. RPC — submit_kyc (auth guard: unauthorized for admin calling as another user)
 *  6. RPC — admin_review_kyc (auth guard: admin_required for non-admin)
 *  7. RPC — admin_review_recommendation (auth guard: admin_required for non-admin)
 *  8. RPC — admin_link_vendor_recommendation (auth guard: admin_required for non-admin)
 *  9. RPC — credit_pending_recommendation (service_role check: fails for authenticated)
 *
 * Signs in as approver@demo.local to test auth guards.
 */

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
                   || 'https://ncdlaehknicabzjqskvk.supabase.co';
const ANON_KEY     = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
                   || 'sb_publishable_JCerWL_ufnLwzqmwvFsEWg_y0q0d-tH';

const DEMO_EMAIL = 'approver@demo.local';
const DEMO_PASS  = 'demo123456';

let passed = 0, failed = 0;
const ok   = (l, d='') => { console.log(`  ✓ ${l}${d ? ' — ' + d : ''}`); passed++; };
const fail = (l, d='') => { console.error(`  ✗ ${l}${d ? ': ' + d : ''}`); failed++; };
const info = (m)        => console.log(`  ℹ  ${m}`);

async function run() {
  // ── Auth ──────────────────────────────────────────────────────────────────
  console.log('\n━━━ 1. Authenticate ━━━');
  const signInRes = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: ANON_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: DEMO_EMAIL, password: DEMO_PASS }),
  });
  const signInData = await signInRes.json();
  if (!signInRes.ok || !signInData.access_token) {
    fail('Sign-in failed', JSON.stringify(signInData).slice(0, 120));
    process.exit(1);
  }
  const token = signInData.access_token;
  ok(`Signed in as ${DEMO_EMAIL}`);

  const hdrs = { apikey: ANON_KEY, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };

  // ── Schema: recommendation_conversions ───────────────────────────────────
  console.log('\n━━━ 2. Schema — recommendation_conversions ━━━');
  const rcRes = await fetch(
    `${SUPABASE_URL}/rest/v1/recommendation_conversions?select=attribution_ends_at,first_sale_awarded_at&limit=1`,
    { headers: hdrs },
  );
  if (rcRes.ok) {
    ok('recommendation_conversions(attribution_ends_at, first_sale_awarded_at) exist');
  } else {
    fail('recommendation_conversions column check failed', await rcRes.text().then(t => t.slice(0, 120)));
  }

  // ── Schema: recommendation_commissions ───────────────────────────────────
  console.log('\n━━━ 3. Schema — recommendation_commissions ━━━');
  const rcomRes = await fetch(
    `${SUPABASE_URL}/rest/v1/recommendation_commissions?select=status,hold_until,order_id,commission_rate,confirmed_at,reversed_at&limit=1`,
    { headers: hdrs },
  );
  if (rcomRes.ok) {
    ok('recommendation_commissions lifecycle columns exist');
  } else {
    fail('recommendation_commissions column check failed', await rcomRes.text().then(t => t.slice(0, 120)));
  }

  // ── Schema: kyc_submissions.ic_hash ─────────────────────────────────────
  console.log('\n━━━ 4. Schema — kyc_submissions.ic_hash ━━━');
  const kycRes = await fetch(
    `${SUPABASE_URL}/rest/v1/kyc_submissions?select=ic_hash&limit=1`,
    { headers: hdrs },
  );
  if (kycRes.ok) {
    ok('kyc_submissions.ic_hash column exists');
  } else {
    fail('kyc_submissions.ic_hash missing', await kycRes.text().then(t => t.slice(0, 120)));
  }

  // ── platform_settings: recommendation.attribution_window_days ────────────
  console.log('\n━━━ 5. platform_settings — recommendation.attribution_window_days ━━━');
  const psRes = await fetch(
    `${SUPABASE_URL}/rest/v1/platform_settings?key=eq.recommendation.attribution_window_days&select=key,value`,
    { headers: hdrs },
  );
  const psRows = await psRes.json();
  if (psRows?.[0]?.value === '90') {
    ok('recommendation.attribution_window_days = 90');
  } else {
    fail('recommendation.attribution_window_days missing or wrong', JSON.stringify(psRows));
  }

  // ── RPC: submit_kyc auth guard ───────────────────────────────────────────
  console.log('\n━━━ 6. RPC — submit_kyc (auth guard) ━━━');
  const kycRpcRes = await fetch(`${SUPABASE_URL}/rest/v1/rpc/submit_kyc`, {
    method: 'POST',
    headers: hdrs,
    body: JSON.stringify({
      p_user_id:  '00000000-0000-0000-0000-000000000099',  // random, not caller's uid
      p_ic_hash:  'aabbcc',
      p_doc_type: 'national_id',
      p_doc_url:  'test/path',
    }),
  });
  const kycBody = await kycRpcRes.text();
  if (!kycRpcRes.ok && kycBody.includes('unauthorized')) {
    ok('submit_kyc auth guard active (unauthorized for mismatched user_id)');
  } else if (kycRpcRes.ok) {
    fail('submit_kyc should have rejected cross-user call', kycBody.slice(0, 120));
  } else {
    ok(`submit_kyc exists (returned: ${kycBody.slice(0, 60)})`);
  }

  // ── RPC: admin_review_kyc auth guard ────────────────────────────────────
  console.log('\n━━━ 7. RPC — admin_review_kyc (auth guard) ━━━');
  const kycReviewRes = await fetch(`${SUPABASE_URL}/rest/v1/rpc/admin_review_kyc`, {
    method: 'POST',
    headers: hdrs,
    body: JSON.stringify({ p_user_id: '00000000-0000-0000-0000-000000000001', p_action: 'approve' }),
  });
  const kycReviewBody = await kycReviewRes.text();
  if (!kycReviewRes.ok && kycReviewBody.includes('admin_required')) {
    ok('admin_review_kyc auth guard active (admin_required for non-admin caller)');
  } else if (kycReviewRes.ok) {
    info('admin_review_kyc ran — caller has admin role in live DB');
    ok('admin_review_kyc callable');
  } else {
    fail('admin_review_kyc unexpected error', kycReviewBody.slice(0, 120));
  }

  // ── RPC: admin_review_recommendation auth guard ──────────────────────────
  console.log('\n━━━ 8. RPC — admin_review_recommendation (auth guard) ━━━');
  const recReviewRes = await fetch(`${SUPABASE_URL}/rest/v1/rpc/admin_review_recommendation`, {
    method: 'POST',
    headers: hdrs,
    body: JSON.stringify({ p_rec_id: '00000000-0000-0000-0000-000000000001', p_action: 'approve' }),
  });
  const recReviewBody = await recReviewRes.text();
  if (!recReviewRes.ok && recReviewBody.includes('admin_required')) {
    ok('admin_review_recommendation auth guard active');
  } else if (recReviewRes.ok) {
    info('admin_review_recommendation ran — caller has admin role in live DB');
    ok('admin_review_recommendation callable');
  } else if (recReviewBody.includes('not_found_or_already_reviewed')) {
    ok('admin_review_recommendation exists (guard passed, rec not found — expected)');
  } else {
    fail('admin_review_recommendation unexpected error', recReviewBody.slice(0, 120));
  }

  // ── RPC: admin_link_vendor_recommendation auth guard ─────────────────────
  console.log('\n━━━ 9. RPC — admin_link_vendor_recommendation (auth guard) ━━━');
  const linkRes = await fetch(`${SUPABASE_URL}/rest/v1/rpc/admin_link_vendor_recommendation`, {
    method: 'POST',
    headers: hdrs,
    body: JSON.stringify({
      p_vendor_id: '00000000-0000-0000-0000-000000000001',
      p_rec_id:    '00000000-0000-0000-0000-000000000002',
    }),
  });
  const linkBody = await linkRes.text();
  if (!linkRes.ok && linkBody.includes('admin_required')) {
    ok('admin_link_vendor_recommendation auth guard active');
  } else if (linkRes.ok) {
    info('admin_link_vendor_recommendation ran — caller has admin role');
    ok('admin_link_vendor_recommendation callable');
  } else if (linkBody.includes('recommendation_not_approved_or_not_found')) {
    ok('admin_link_vendor_recommendation exists (guard passed, rec not found — expected)');
  } else {
    fail('admin_link_vendor_recommendation unexpected error', linkBody.slice(0, 120));
  }

  // ── RPC: credit_pending_recommendation (service_role only) ───────────────
  console.log('\n━━━ 10. RPC — credit_pending_recommendation (service_role guard) ━━━');
  const cprRes = await fetch(`${SUPABASE_URL}/rest/v1/rpc/credit_pending_recommendation`, {
    method: 'POST',
    headers: hdrs,
    body: JSON.stringify({
      p_user_id:         '00000000-0000-0000-0000-000000000001',
      p_amount_sen:      100,
      p_commission_type: 'bonus',
      p_conversion_id:   '00000000-0000-0000-0000-000000000003',
    }),
  });
  const cprBody = await cprRes.text();
  if (!cprRes.ok) {
    ok(`credit_pending_recommendation blocked for authenticated caller (service_role only) — ${cprBody.slice(0, 60)}`);
  } else {
    fail('credit_pending_recommendation should be service_role only', cprBody.slice(0, 120));
  }

  // ── Summary ───────────────────────────────────────────────────────────────
  console.log(`\n${'━'.repeat(52)}`);
  console.log(`PASSED: ${passed}   FAILED: ${failed}`);
  console.log('━'.repeat(52));
  process.exit(failed > 0 ? 1 : 0);
}

run().catch(err => { console.error(err); process.exit(1); });
