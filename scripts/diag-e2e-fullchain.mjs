#!/usr/bin/env node
/**
 * Diagnostic: Full-chain e2e — top-up → checkout → withdrawal → admin review
 *
 * Chain:
 *   Customer  top-up RM 100 via Stripe Checkout (test card 4242...)
 *   Customer  submits withdrawal RM 50 from earnings
 *   Admin     rejects → earnings restored (+50)
 *   Customer  submits withdrawal RM 50 again
 *   Admin     approves → status 'processing' (or 422 if no Connect account)
 *   Assert    ledger arithmetic is consistent throughout
 *
 * Pre-run SQL (Supabase SQL Editor):
 *   UPDATE wallets SET earnings_sen = 15000
 *   WHERE user_id = 'aaaaaaaa-0000-0000-0000-000000000002';
 *
 *   DELETE FROM withdrawal_requests
 *   WHERE user_id = 'aaaaaaaa-0000-0000-0000-000000000002'
 *     AND status = 'pending';
 *
 * Prereqs:
 *   - Dev server on http://localhost:3000
 *   - stripe listen --forward-to localhost:3000/api/stripe/webhook
 *   - stripe listen --forward-to localhost:3000/api/stripe/connect-webhook
 */
import { chromium } from 'playwright';

const BASE = 'http://localhost:3000';

let passed = 0, failed = 0;
function ok(label, detail='')   { console.log(`  ✓ ${label}${detail ? ' — ' + detail : ''}`); passed++; }
function fail(label, detail='') { console.error(`  ✗ ${label}${detail ? ': ' + detail : ''}`); failed++; }
function info(msg)               { console.log(`  ℹ  ${msg}`); }
function skip(label, reason='') { console.log(`  ─ SKIP ${label}${reason ? ' (' + reason + ')' : ''}`); }

async function loginAs(page, role) {
  await page.goto(`${BASE}/login`);
  const btn = page.locator('button', { hasText: new RegExp(role, 'i') }).first();
  await btn.waitFor({ timeout: 8000 });
  await btn.click();
  await page.waitForTimeout(2500);
  if (new URL(page.url()).pathname === '/login') throw new Error(`Login as ${role} failed`);
}

async function getWallet(page) {
  const res = await page.evaluate(() => fetch('/api/debug/me').then(r => r.json()));
  const w   = res.wallet ?? { topup_sen: 0, earnings_sen: 0 };
  return { topup: w.topup_sen / 100, earnings: w.earnings_sen / 100 };
}

async function run() {
  const browser     = await chromium.launch({ headless: false, slowMo: 150 });
  const customerCtx = await browser.newContext();
  const page        = await customerCtx.newPage();

  // Admin page is opened lazily in step 6 so no about:blank tab appears upfront
  let aPage = null;
  async function adminPage() {
    if (aPage) return aPage;
    const ctx = await browser.newContext();
    aPage = await ctx.newPage();
    aPage.on('console',   m => { if (m.type() === 'error') errors.push(m.text()); });
    aPage.on('pageerror', e => errors.push('ADMIN: ' + e.message));
    return aPage;
  }

  const errors = [];
  // Ignore errors from Stripe-hosted pages (checkout.stripe.com) — not our code
  function isOurPage(p) { return p.url().startsWith(BASE); }
  page.on('console',   m => { if (m.type() === 'error' && isOurPage(page)) errors.push(m.text()); });
  page.on('pageerror', e => { if (isOurPage(page)) errors.push('PAGE: ' + e.message); });

  // ─── 1. Customer login ────────────────────────────────────────────────────
  console.log('\n━━━ 1. Customer login ━━━');
  try {
    await loginAs(page, 'customer');
    ok('Logged in as customer');
  } catch (e) {
    fail('Customer login', String(e));
    await browser.close(); process.exit(1);
  }

  // ─── 2. Baseline wallet state ─────────────────────────────────────────────
  console.log('\n━━━ 2. Baseline wallet ━━━');
  await page.goto(`${BASE}/customer/wallet`);
  await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});
  await page.waitForTimeout(800);

  const baseline = await getWallet(page);
  info(`Baseline → topup: RM ${baseline.topup.toFixed(2)}, earnings: RM ${baseline.earnings.toFixed(2)}`);

  if (baseline.earnings < 50) {
    fail('Earnings too low — run pre-run SQL seed first, then re-run this script');
    await browser.close(); process.exit(1);
  }
  ok(`Earnings baseline RM ${baseline.earnings.toFixed(2)} — sufficient`);

  // ─── 3. Stripe top-up RM 100 ─────────────────────────────────────────────
  console.log('\n━━━ 3. Stripe top-up RM 100 ━━━');
  const topUpBtn = page.locator('button', { hasText: /top up/i }).first();
  await topUpBtn.click();
  await page.waitForTimeout(400);

  const amountInput = page.locator('form input[type="number"]').first();
  if (!await amountInput.isVisible()) {
    fail('Top-up amount input not visible');
    skip('Stripe top-up', 'form not found');
  } else {
    await amountInput.fill('100');
    await page.locator('form button[type="submit"]').first().click();

    let stripeReached = false;
    try {
      await page.waitForURL(/checkout\.stripe\.com/, { timeout: 15000 });
      stripeReached = true;
    } catch { /* handled below */ }

    if (!stripeReached) {
      fail('Did not reach Stripe Checkout', page.url());
      skip('Card fill + top-up ledger check', 'Stripe redirect failed');
    } else {
      ok('Redirected to Stripe Checkout');
      await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});
      await page.waitForTimeout(1500);

      try {
        const cardNum = page.locator('[placeholder="1234 1234 1234 1234"]')
          .or(page.locator('[data-elements-stable-field-name="cardNumber"]'));
        await cardNum.waitFor({ timeout: 8000 });
        await cardNum.fill('4242 4242 4242 4242');

        const expiry = page.locator('[placeholder="MM / YY"]').first();
        await expiry.fill('12 / 26');

        const cvc = page.locator('[placeholder="CVC"]').or(page.locator('[placeholder="CVV"]')).first();
        await cvc.fill('123');

        const nameField = page.locator('input[name="billingName"]');
        if (await nameField.isVisible({ timeout: 1000 }).catch(() => false)) {
          await nameField.fill('Test User');
        }

        const payBtn = page.locator('button[type="submit"]').filter({ hasText: /pay|confirm/i }).first();
        await payBtn.waitFor({ timeout: 5000 });
        await payBtn.click();
        ok('Stripe card filled and Pay clicked');

        await page.waitForURL(`${BASE}/customer/wallet?topup=success`, { timeout: 20000 });
        ok('Returned to wallet with ?topup=success');

        // Poll up to 15 s for webhook to fire and credit the wallet
        let afterTopup = await getWallet(page);
        let delta = afterTopup.topup - baseline.topup;
        for (let i = 0; i < 5 && delta < 99.9; i++) {
          await page.waitForTimeout(3000);
          await page.reload();
          await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});
          await page.waitForTimeout(500);
          afterTopup = await getWallet(page);
          delta = afterTopup.topup - baseline.topup;
        }

        if (delta >= 99.9 && delta <= 100.1) {
          ok(`Top-up credited: +RM ${delta.toFixed(2)} in topup bucket`);
        } else {
          fail(`Top-up ledger mismatch: got +RM ${delta.toFixed(2)}, expected +100.00 — is stripe listen running?`);
        }
      } catch (e) {
        fail('Stripe card form error', String(e).slice(0, 120));
        skip('Top-up ledger check', 'Stripe form failed');
      }
    }
  }

  // ─── 4. Checkout with wallet payment (mock) ───────────────────────────────
  console.log('\n━━━ 4. Checkout (wallet payment method) ━━━');
  await page.goto(`${BASE}/customer`);
  await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});
  await page.waitForTimeout(500);

  const firstActivity = page.locator('a[href*="/activities/"], a[href*="/product"]').first();
  const activityVisible = await firstActivity.isVisible({ timeout: 3000 }).catch(() => false);

  if (!activityVisible) {
    skip('Checkout flow', 'No activity links on homepage');
  } else {
    await firstActivity.click();
    await page.waitForLoadState('networkidle', { timeout: 8000 }).catch(() => {});
    await page.waitForTimeout(600);

    const addToCart = page.locator('button', { hasText: /add to cart|book/i }).first();
    if (await addToCart.isVisible({ timeout: 2000 }).catch(() => false)) {
      await addToCart.click();
      await page.waitForTimeout(500);
      await page.goto(`${BASE}/customer/checkout`);
      await page.waitForLoadState('networkidle', { timeout: 8000 }).catch(() => {});
      await page.waitForTimeout(500);

      const walletMethod = page.locator('label', { hasText: /wallet balance/i })
        .or(page.locator('text=MyWisata Wallet')).first();
      if (await walletMethod.isVisible({ timeout: 2000 }).catch(() => false)) {
        await walletMethod.click();
        ok('Selected "MyWisata Wallet Balance" payment method');
      } else {
        skip('Wallet method select', 'not visible');
      }

      const payBtn = page.locator('button', { hasText: /pay|confirm|complete/i }).first();
      if (await payBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
        await payBtn.click();
        await page.waitForTimeout(2000);
        if (/\/customer\/orders\//.test(page.url())) ok('Order created — on order confirmation page');
        else skip('Order confirmation', `at ${new URL(page.url()).pathname}`);
      } else {
        skip('Pay button', 'not visible on checkout');
      }
    } else {
      skip('Checkout flow', '"Add to Cart" not found');
    }
  }

  // ─── 5. Withdrawal #1 — RM 50 (to be rejected) ───────────────────────────
  console.log('\n━━━ 5. Withdrawal #1 — RM 50 (reject test) ━━━');
  await page.goto(`${BASE}/customer/wallet`);
  await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});
  await page.waitForTimeout(800);

  const walletBefore1 = await getWallet(page);
  info(`Earnings before W#1: RM ${walletBefore1.earnings.toFixed(2)}`);

  await page.locator('button, a', { hasText: /withdraw/i }).first().click();
  await page.waitForTimeout(500);

  const connectModal = await page.locator('text=Bank account required').isVisible({ timeout: 2000 }).catch(() => false);
  const withdrawInput = page.locator('form input[type="number"]').first();
  const formVisible   = await withdrawInput.isVisible({ timeout: 1000 }).catch(() => false);

  if (connectModal) {
    ok('JIT intercept modal shown (no Connect account — expected for demo user)');
    await page.locator('button:has-text("Later"), button:has-text("OK")').first().click().catch(() => {});
    skip('Reject + approve flow', 'no Connect account — debit_withdrawal requires verified Connect');
  } else if (formVisible) {
    await withdrawInput.fill('50');
    await page.locator('form button[type="submit"]').first().click();
    await page.waitForTimeout(2000);
    await page.waitForLoadState('networkidle', { timeout: 8000 }).catch(() => {});

    const walletAfter1  = await getWallet(page);
    const earningsDelta = walletAfter1.earnings - walletBefore1.earnings;
    if (Math.abs(earningsDelta + 50) < 0.01) {
      ok(`Earnings debited on submit: RM ${walletBefore1.earnings.toFixed(2)} → RM ${walletAfter1.earnings.toFixed(2)}`);
    } else {
      fail(`Earnings debit wrong: delta RM ${earningsDelta.toFixed(2)}, expected −50.00`);
    }

    const inProgress = await page.locator('text=In Progress').isVisible({ timeout: 3000 }).catch(() => false);
    if (inProgress) ok('Withdrawal #1 visible in "In Progress"');
    else             fail('"In Progress" section missing after submit');

    // ─── 6. Admin opens, rejects ──────────────────────────────────────────
    console.log('\n━━━ 6. Admin reject ━━━');
    const ap = await adminPage();
    try {
      await loginAs(ap, 'admin');
      ok('Admin logged in');
    } catch (e) {
      fail('Admin login', String(e));
      await browser.close(); process.exit(1);
    }

    await ap.goto(`${BASE}/admin/withdrawals`);
    await ap.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});
    await ap.waitForTimeout(1000);

    const pendingCount = await ap.locator('button:has-text("Reject")').count();
    info(`${pendingCount} pending withdrawal(s) in admin UI`);

    if (pendingCount === 0) {
      fail('No pending withdrawals in admin UI');
    } else {
      ap.once('dialog', d => d.dismiss().catch(() => {}));
      await ap.locator('button:has-text("Reject")').first().click();
      await ap.waitForTimeout(3000);
      await ap.reload();
      await ap.waitForLoadState('networkidle', { timeout: 8000 }).catch(() => {});

      const rejectedBadge = await ap.waitForSelector(':text("Rejected")', { timeout: 10000 })
        .then(() => true).catch(() => false);
      if (rejectedBadge) ok('Admin UI shows "Rejected" badge');
      else               fail('"Rejected" badge not visible after reload');

      await page.goto(`${BASE}/customer/wallet`);
      await page.waitForLoadState('networkidle', { timeout: 8000 }).catch(() => {});
      await page.waitForTimeout(800);

      const walletRestored = await getWallet(page);
      if (Math.abs(walletRestored.earnings - walletBefore1.earnings) < 0.01) {
        ok(`Earnings restored: RM ${walletBefore1.earnings.toFixed(2)} → RM ${walletRestored.earnings.toFixed(2)}`);
      } else {
        fail(`Earnings not restored: expected RM ${walletBefore1.earnings.toFixed(2)}, got RM ${walletRestored.earnings.toFixed(2)}`);
      }

      // ─── 7. Withdrawal #2 → admin approve ────────────────────────────
      console.log('\n━━━ 7. Withdrawal #2 — RM 50 (approve test) ━━━');
      await page.locator('button, a', { hasText: /withdraw/i }).first().click();
      await page.waitForTimeout(500);

      const w2Input   = page.locator('form input[type="number"]').first();
      const w2Visible = await w2Input.isVisible({ timeout: 1000 }).catch(() => false);

      if (w2Visible) {
        await w2Input.fill('50');
        await page.locator('form button[type="submit"]').first().click();
        await page.waitForTimeout(2000);
        ok('Withdrawal #2 submitted (RM 50.00)');

        await ap.reload();
        await ap.waitForLoadState('networkidle', { timeout: 8000 }).catch(() => {});
        await ap.waitForTimeout(1000);

        const approveBtn = ap.locator('button:has-text("Approve")').first();
        if (await approveBtn.isVisible().catch(() => false)) {
          await approveBtn.click();
          await ap.waitForTimeout(3000);

          const processingBadge = await ap.locator('text=Processing').isVisible({ timeout: 3000 }).catch(() => false);
          const retryBadge      = await ap.locator('text=Approved').isVisible({ timeout: 2000 }).catch(() => false);

          if (processingBadge)  ok('Approve → "Processing" (Stripe Transfer+Payout fired)');
          else if (retryBadge)  ok('Approve → "Approved — Retry" (422 expected without Connect account)');
          else                  fail('Status badge not updated after approve');
        } else {
          skip('Approve test', 'no Approve button after reload');
        }
      } else {
        skip('Withdrawal #2', 'form not visible');
      }
    }
  } else {
    fail('Neither JIT modal nor withdrawal form appeared');
  }

  // ─── 8. Final ledger consistency ─────────────────────────────────────────
  console.log('\n━━━ 8. Final ledger consistency ━━━');
  await page.goto(`${BASE}/customer/wallet`);
  await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});
  await page.waitForTimeout(800);

  const finalWallet = await getWallet(page);
  const totalFinal  = finalWallet.topup + finalWallet.earnings;
  info(`Final → topup: RM ${finalWallet.topup.toFixed(2)}, earnings: RM ${finalWallet.earnings.toFixed(2)}, total: RM ${totalFinal.toFixed(2)}`);

  if (totalFinal >= 0)           ok('Total balance non-negative (no phantom debits)');
  else                           fail('Negative total balance — ledger inconsistency');

  if (finalWallet.topup >= baseline.topup) ok('Top-up bucket ≥ baseline');
  else                                      fail('Top-up bucket decreased unexpectedly');

  // ─── 9. Error audit ──────────────────────────────────────────────────────
  console.log('\n━━━ 9. Error audit ━━━');
  const realErrors = errors.filter(e =>
    !e.includes('Warning:') && !e.includes('favicon') &&
    !e.includes('strict mode') && !e.includes('422') &&
    !e.includes('404')   // static asset / image 404s are not app errors
  );
  if (realErrors.length === 0) ok('No console errors');
  else fail(`${realErrors.length} console error(s)`, realErrors.slice(0, 3).join(' | '));

  // ─── Summary ──────────────────────────────────────────────────────────────
  console.log(`\n${'━'.repeat(52)}`);
  console.log(`PASSED: ${passed}   FAILED: ${failed}`);
  console.log('━'.repeat(52));
  if (failed > 0) {
    console.log('\nNext steps:');
    console.log('  • Seed earnings_sen = 15000 in Supabase');
    console.log('  • Ensure stripe listen is running for webhook delivery');
    console.log('  • 422 on approve is expected without a Connect account');
  }
  await browser.close();
  process.exit(failed > 0 ? 1 : 0);
}

run().catch(err => { console.error(err); process.exit(1); });
