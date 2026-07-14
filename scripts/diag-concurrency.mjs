#!/usr/bin/env node
/**
 * Diagnostic: Concurrent withdrawal — race condition guard
 *
 * Sends two simultaneous debit_withdrawal RPC calls for the same user.
 * The SELECT FOR UPDATE lock in debit_withdrawal ensures exactly one
 * succeeds when the combined amount exceeds available earnings.
 *
 * Expected: 1 success (200), 1 failure (400/500 with 'insufficient_earnings')
 *
 * Pre-run SQL (Supabase SQL Editor):
 *   UPDATE wallets SET earnings_sen = 10000
 *   WHERE user_id = 'aaaaaaaa-0000-0000-0000-000000000002';
 *
 *   DELETE FROM withdrawal_requests
 *   WHERE user_id = 'aaaaaaaa-0000-0000-0000-000000000002'
 *     AND status = 'pending';
 *
 * Prereqs:
 *   - Dev server on http://localhost:3000 (for /api/auth/demo-signin)
 */
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
                   || 'https://ncdlaehknicabzjqskvk.supabase.co';
const ANON_KEY     = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
                   || 'sb_publishable_JCerWL_ufnLwzqmwvFsEWg_y0q0d-tH';
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const BASE         = 'http://localhost:3000';

// User seeded with earnings_sen = 10000 (RM 100)
const DEMO_EMAIL   = 'approver@demo.local';
const DEMO_PASS    = 'demo123456';
const USER_ID      = 'aaaaaaaa-0000-0000-0000-000000000002';

// Two requests at RM 70 each → combined RM 140 > RM 100 → exactly 1 must fail
const WITHDRAW_RM  = 70;

let passed = 0, failed = 0;
function ok(label, detail='')   { console.log(`  ✓ ${label}${detail ? ' — ' + detail : ''}`); passed++; }
function fail(label, detail='') { console.error(`  ✗ ${label}${detail ? ': ' + detail : ''}`); failed++; }
function info(msg)               { console.log(`  ℹ  ${msg}`); }

async function run() {
  // ─── 1. Sign in via Supabase auth REST API ────────────────────────────────
  console.log('\n━━━ 1. Authenticate (Supabase auth REST API) ━━━');
  const signInRes = await fetch(
    `${SUPABASE_URL}/auth/v1/token?grant_type=password`,
    {
      method:  'POST',
      headers: { 'apikey': ANON_KEY, 'Content-Type': 'application/json' },
      body:    JSON.stringify({ email: DEMO_EMAIL, password: DEMO_PASS }),
    }
  );
  const signInData = await signInRes.json();

  if (!signInRes.ok || !signInData.access_token) {
    fail('Sign-in failed', JSON.stringify(signInData).slice(0, 120));
    process.exit(1);
  }
  const token = signInData.access_token;
  ok(`Signed in as ${DEMO_EMAIL}`);
  info(`User ID: ${USER_ID}`);

  // ─── 2. Read baseline earnings ────────────────────────────────────────────
  console.log('\n━━━ 2. Baseline earnings ━━━');
  const walletRes = await fetch(
    `${SUPABASE_URL}/rest/v1/wallets?user_id=eq.${USER_ID}&select=earnings_sen`,
    {
      headers: {
        'apikey':        ANON_KEY,
        'Authorization': `Bearer ${token}`,
      },
    }
  );
  const walletRows = await walletRes.json();
  const earningsSen = walletRows?.[0]?.earnings_sen ?? 0;
  info(`Earnings: RM ${(earningsSen / 100).toFixed(2)} (${earningsSen} sen)`);

  if (earningsSen < WITHDRAW_RM * 100) {
    fail(`Earnings too low — seed earnings_sen = 10000 first`);
    process.exit(1);
  }
  if (earningsSen >= WITHDRAW_RM * 2 * 100) {
    fail(`Earnings (${earningsSen} sen) are enough for BOTH requests — test would not prove locking. Seed earnings_sen = 10000.`);
    process.exit(1);
  }
  ok(`Earnings RM ${(earningsSen / 100).toFixed(2)} — enough for 1× RM ${WITHDRAW_RM}, not 2× RM ${WITHDRAW_RM}`);

  // ─── 3. Fire two concurrent debit_withdrawal RPCs ─────────────────────────
  console.log(`\n━━━ 3. Concurrent debit_withdrawal (2 × RM ${WITHDRAW_RM}) ━━━`);
  info(`SELECT FOR UPDATE in debit_withdrawal serializes both → exactly 1 should succeed`);

  const rpcUrl = `${SUPABASE_URL}/rest/v1/rpc/debit_withdrawal`;
  const headers = {
    'apikey':        ANON_KEY,
    'Authorization': `Bearer ${token}`,
    'Content-Type':  'application/json',
  };
  const body = JSON.stringify({ p_user_id: USER_ID, p_amount_rm: WITHDRAW_RM });

  const call = () => fetch(rpcUrl, { method: 'POST', headers, body })
    .then(async r => ({ status: r.status, body: await r.text() }));

  const start = Date.now();
  const [r1, r2] = await Promise.all([call(), call()]);
  const elapsed = Date.now() - start;

  info(`Both completed in ${elapsed}ms`);
  info(`Request A: HTTP ${r1.status} — ${r1.body.slice(0, 100)}`);
  info(`Request B: HTTP ${r2.status} — ${r2.body.slice(0, 100)}`);

  // ─── 4. Assertions ────────────────────────────────────────────────────────
  console.log('\n━━━ 4. Assertions ━━━');

  const successes = [r1, r2].filter(r => r.status === 200).length;
  const failures  = [r1, r2].filter(r => r.status !== 200).length;

  if (successes === 1 && failures === 1) {
    ok('Exactly 1 succeeded, 1 failed — SELECT FOR UPDATE lock working');
  } else if (successes === 2) {
    fail('Both requests succeeded — DOUBLE-SPEND: race condition not prevented!');
  } else {
    fail(`Unexpected: ${successes} successes, ${failures} failures — check seed`);
  }

  const failedBody = r1.status !== 200 ? r1.body : r2.body;
  if (failedBody.includes('insufficient_earnings') || failedBody.includes('insufficient')) {
    ok('Failure reason: insufficient_earnings — correct');
  } else {
    fail('Failure body missing "insufficient_earnings"', failedBody.slice(0, 120));
  }

  // ─── 5. Final earnings check — debited exactly once ───────────────────────
  console.log('\n━━━ 5. Final earnings (debited exactly once?) ━━━');
  const finalRes = await fetch(
    `${SUPABASE_URL}/rest/v1/wallets?user_id=eq.${USER_ID}&select=earnings_sen`,
    { headers: { 'apikey': ANON_KEY, 'Authorization': `Bearer ${token}` } }
  );
  const finalRows = await finalRes.json();
  const finalSen  = finalRows?.[0]?.earnings_sen ?? 0;
  const expectedSen = earningsSen - (WITHDRAW_RM * 100);

  info(`Earnings: ${earningsSen} → ${finalSen} sen (expected ${expectedSen} sen)`);

  if (Math.abs(finalSen - expectedSen) < 1) {
    ok(`Deducted exactly once: −${WITHDRAW_RM * 100} sen (RM ${WITHDRAW_RM}.00)`);
  } else if (finalSen === earningsSen) {
    fail('Earnings unchanged — neither request succeeded (check debit_withdrawal RPC)');
  } else {
    fail(
      `Earnings deducted ${earningsSen - finalSen} sen, expected ${WITHDRAW_RM * 100} sen`,
      finalSen < expectedSen ? 'DOUBLE-DEDUCT: both requests debited!' : ''
    );
  }

  // ─── 6. Pending withdrawal count ──────────────────────────────────────────
  console.log('\n━━━ 6. Pending withdrawal count ━━━');
  const wrRes = await fetch(
    `${SUPABASE_URL}/rest/v1/withdrawal_requests?user_id=eq.${USER_ID}&status=eq.pending&select=id,amount`,
    { headers: { 'apikey': ANON_KEY, 'Authorization': `Bearer ${token}` } }
  );
  const wrRows = await wrRes.json();
  info(`Pending withdrawal requests: ${wrRows.length}`);

  if (wrRows.length === 1) {
    ok(`Exactly 1 pending withdrawal_request created (RM ${wrRows[0].amount})`);
  } else if (wrRows.length === 2) {
    fail('2 pending requests found — double insert despite lock failure');
  } else {
    fail(`Expected 1 pending request, found ${wrRows.length}`);
  }

  // ─── Summary ──────────────────────────────────────────────────────────────
  console.log(`\n${'━'.repeat(52)}`);
  console.log(`PASSED: ${passed}   FAILED: ${failed}`);
  console.log('━'.repeat(52));
  if (failed > 0 && successes === 2) {
    console.log('\n⚠  DOUBLE-SPEND detected — debit_withdrawal is missing SELECT FOR UPDATE.');
  }
  process.exit(failed > 0 ? 1 : 0);
}

run().catch(err => { console.error(err); process.exit(1); });
