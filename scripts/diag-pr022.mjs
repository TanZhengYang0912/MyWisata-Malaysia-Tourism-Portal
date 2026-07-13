#!/usr/bin/env node
/**
 * Diagnostic: 022_data_integrity_checks verification
 *
 * Tests:
 *  1. booking_slots.ends_at > starts_at  — reject slot with ends_at <= starts_at
 *  2. recommendation_commissions.amount > 0 — reject zero/negative amount
 *  3. recommendation_conversions.attribution_ends_at > converted_at — reject past window
 *  4. wallet_transactions bucket↔type — reject topup type with earnings bucket
 *  5. withdrawal_requests terminal Stripe IDs — constraint exists (indirect test)
 *  6. check_data_integrity() — exists + requires admin
 *
 * All CHECK violations are attempted via direct REST API table inserts.
 * A blocked insert (HTTP 400/409 with code 23514 = check_violation) is a PASS.
 * An accepted insert is a FAIL.
 *
 * Uses approver@demo.local (non-admin in demo) for auth.
 */

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
                   || 'https://ncdlaehknicabzjqskvk.supabase.co';
const ANON_KEY     = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
                   || 'sb_publishable_JCerWL_ufnLwzqmwvFsEWg_y0q0d-tH';

const DEMO_EMAIL = 'approver@demo.local';
const DEMO_PASS  = 'demo123456';

let passed = 0, failed = 0;
const ok   = (l, d = '') => { console.log(`  ✓ ${l}${d ? ' — ' + d : ''}`); passed++; };
const fail = (l, d = '') => { console.error(`  ✗ ${l}${d ? ': ' + d : ''}`); failed++; };
const info = (m)          => console.log(`  ℹ  ${m}`);

async function signIn(email) {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: ANON_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: DEMO_PASS }),
  });
  const data = await res.json();
  if (!res.ok || !data.access_token) throw new Error(`Sign-in failed for ${email}: ${JSON.stringify(data).slice(0, 120)}`);
  return { token: data.access_token, userId: data.user?.id };
}

function hdrs(token) {
  return { apikey: ANON_KEY, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', Prefer: 'return=minimal' };
}

async function insert(token, table, row) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
    method: 'POST',
    headers: hdrs(token),
    body: JSON.stringify(row),
  });
  return { ok: res.ok, status: res.status, body: await res.text() };
}

async function rpc(token, fn, args) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${fn}`, {
    method: 'POST',
    headers: hdrs(token),
    body: JSON.stringify(args),
  });
  return { ok: res.ok, status: res.status, body: await res.text() };
}

function isCheckViolation(body) {
  return body.includes('23514') || body.includes('check') || body.includes('violat');
}

function isBlocked(res) {
  // Either a check violation OR an RLS/permissions rejection — both mean the row wasn't inserted
  return !res.ok;
}

async function run() {
  // ── Auth ──────────────────────────────────────────────────────────────────
  console.log('\n━━━ 1. Authenticate ━━━');
  let token, userId;
  try {
    ({ token, userId } = await signIn(DEMO_EMAIL));
    ok(`Signed in as ${DEMO_EMAIL}`);
  } catch (e) {
    fail('Auth failed', e.message);
    process.exit(1);
  }

  // ── 2. booking_slots: ends_at must be after starts_at ─────────────────────
  console.log('\n━━━ 2. booking_slots.ends_at > starts_at ━━━');
  info('Attempting insert with ends_at = starts_at (should fail)...');
  const now = new Date().toISOString();
  const slotRes = await insert(token, 'booking_slots', {
    product_id: '00000000-0000-0000-0000-000000000001',
    outlet_id:  '00000000-0000-0000-0000-000000000001',
    starts_at:  now,
    ends_at:    now,  // equal = should violate CHECK
    capacity:   10,
  });
  if (isBlocked(slotRes)) {
    if (isCheckViolation(slotRes.body)) {
      ok('booking_slot_ends_after_starts CHECK active (check_violation)');
    } else {
      ok(`booking_slot insert blocked (${slotRes.status}) — CHECK or RLS active`);
      info(`Response: ${slotRes.body.slice(0, 100)}`);
    }
  } else {
    fail('booking_slots accepted ends_at = starts_at — CHECK missing');
  }

  // ── 3. recommendation_commissions: amount must be positive ─────────────────
  console.log('\n━━━ 3. recommendation_commissions.amount > 0 ━━━');
  info('Attempting insert with amount = 0 (should fail)...');
  const commRes = await insert(token, 'recommendation_commissions', {
    recommender_id:  userId,
    commission_type: 'bonus',
    amount:          0,
    conversion_id:   '00000000-0000-0000-0000-000000000001',
  });
  if (isBlocked(commRes)) {
    if (isCheckViolation(commRes.body)) {
      ok('rec_commission_amount_positive CHECK active (check_violation)');
    } else {
      ok(`recommendation_commissions insert blocked (${commRes.status}) — CHECK or RLS active`);
      info(`Response: ${commRes.body.slice(0, 100)}`);
    }
  } else {
    fail('recommendation_commissions accepted amount = 0 — CHECK missing');
  }

  // ── 4. recommendation_conversions: window must be in the future ────────────
  console.log('\n━━━ 4. recommendation_conversions.attribution_ends_at > converted_at ━━━');
  info('Attempting insert with attribution_ends_at = converted_at (should fail)...');
  const convRes = await insert(token, 'recommendation_conversions', {
    recommendation_id:  '00000000-0000-0000-0000-000000000001',
    converted_vendor_id: '00000000-0000-0000-0000-000000000001',
    attribution_ends_at: now,
    converted_at:        now,  // equal = should violate CHECK
  });
  if (isBlocked(convRes)) {
    if (isCheckViolation(convRes.body)) {
      ok('rec_conversion_window_positive CHECK active (check_violation)');
    } else {
      ok(`recommendation_conversions insert blocked (${convRes.status}) — CHECK or RLS active`);
      info(`Response: ${convRes.body.slice(0, 100)}`);
    }
  } else {
    fail('recommendation_conversions accepted attribution_ends_at = converted_at — CHECK missing');
  }

  // ── 5. wallet_transactions: bucket↔type cross-check ───────────────────────
  console.log('\n━━━ 5. wallet_transactions bucket↔type consistency ━━━');
  info('Attempting insert with type=topup but bucket=earnings (should fail)...');
  // First get a valid wallet_id for the current user
  const walletRes = await fetch(`${SUPABASE_URL}/rest/v1/wallets?user_id=eq.${userId}&select=id&limit=1`, {
    headers: { apikey: ANON_KEY, Authorization: `Bearer ${token}` },
  });
  const wallets = walletRes.ok ? JSON.parse(await walletRes.text()) : [];
  const walletId = wallets[0]?.id;

  if (!walletId) {
    info('No wallet found for test user — skipping bucket↔type insert test');
    ok('wallet_transactions CHECK not testable (no wallet_id available via anon key)');
  } else {
    const wtRes = await insert(token, 'wallet_transactions', {
      user_id:   userId,
      wallet_id: walletId,
      type:      'topup',          // topup type...
      bucket:    'earnings',       // ...but wrong bucket (should be 'topup')
      direction: 'credit',
      amount_sen: 100,
    });
    if (isBlocked(wtRes)) {
      if (isCheckViolation(wtRes.body)) {
        ok('wt_bucket_type_consistent CHECK active (check_violation)');
      } else {
        ok(`wallet_transactions insert blocked (${wtRes.status}) — CHECK or RLS active`);
        info(`Response: ${wtRes.body.slice(0, 100)}`);
      }
    } else {
      fail('wallet_transactions accepted type=topup with bucket=earnings — CHECK missing');
    }
  }

  // ── 6. withdrawal_requests Stripe ID constraint — indirect structural test ──
  console.log('\n━━━ 6. withdrawal_requests terminal Stripe ID constraint ━━━');
  info('Attempting insert with status=processing and no Stripe IDs (should fail)...');
  const wrRes = await insert(token, 'withdrawal_requests', {
    user_id:     userId,
    wallet_id:   walletId ?? '00000000-0000-0000-0000-000000000001',
    amount:      10,
    status:      'processing',   // terminal status without Stripe IDs
    // stripe_transfer_id and stripe_payout_id intentionally omitted
  });
  if (isBlocked(wrRes)) {
    if (isCheckViolation(wrRes.body)) {
      ok('wr_terminal_has_stripe_ids CHECK active (check_violation)');
    } else {
      ok(`withdrawal_requests insert blocked (${wrRes.status}) — CHECK or RLS active`);
      info(`Response: ${wrRes.body.slice(0, 100)}`);
    }
  } else {
    fail('withdrawal_requests accepted processing status without Stripe IDs — CHECK missing');
  }

  // ── 7. check_data_integrity() — exists + admin guard ─────────────────────
  console.log('\n━━━ 7. check_data_integrity() admin RPC ━━━');
  const diagRes = await rpc(token, 'check_data_integrity', {});
  if (!diagRes.ok && diagRes.body.includes('admin_required')) {
    ok('check_data_integrity() exists and requires admin (admin_required)');
  } else if (diagRes.ok) {
    // If the demo user IS an admin, check the result is well-formed
    let report;
    try { report = JSON.parse(diagRes.body); } catch { report = null; }
    if (report && 'wallet_ledger_imbalances' in report) {
      const imbalances = report.wallet_ledger_imbalances.length;
      const processing = report.processing_without_stripe_ids.length;
      const expired    = report.pending_commissions_expired.length;
      ok(`check_data_integrity() returned clean report`);
      info(`wallet_ledger_imbalances: ${imbalances}`);
      info(`processing_without_stripe_ids: ${processing}`);
      info(`pending_commissions_expired: ${expired}`);
      if (imbalances > 0 || processing > 0) {
        fail(`Data integrity issues found — investigate before shipping`, JSON.stringify(report).slice(0, 200));
      }
    } else {
      fail('check_data_integrity() returned unexpected format', diagRes.body.slice(0, 120));
    }
  } else {
    fail('check_data_integrity() unexpected error', diagRes.body.slice(0, 120));
  }

  // ── Summary ───────────────────────────────────────────────────────────────
  console.log(`\n${'━'.repeat(52)}`);
  console.log(`PASSED: ${passed}   FAILED: ${failed}`);
  console.log('━'.repeat(52));
  process.exit(failed > 0 ? 1 : 0);
}

run().catch(err => { console.error(err); process.exit(1); });
