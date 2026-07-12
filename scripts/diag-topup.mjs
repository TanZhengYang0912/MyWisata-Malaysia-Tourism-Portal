#!/usr/bin/env node
/**
 * Diagnostic: Stripe top-up flow
 * Tests: login → wallet page → Top Up form → Stripe Checkout redirect →
 *        return with ?topup=success banner → balance display correct.
 *
 * Stripe test card: 4242 4242 4242 4242  exp 12/26  CVC 123
 * Requires dev server on http://localhost:3000 AND stripe listen running.
 * Run: node scripts/diag-topup.mjs
 */
import { chromium } from 'playwright';

const BASE = 'http://localhost:3000';

let passed = 0;
let failed = 0;
function ok(label)              { console.log(`  ✓ ${label}`); passed++; }
function fail(label, detail='') { console.error(`  ✗ ${label}${detail ? ': ' + detail : ''}`); failed++; }

async function run() {
  const browser = await chromium.launch({ headless: false, slowMo: 200 });
  const ctx  = await browser.newContext();
  const page = await ctx.newPage();

  const consoleErrors = [];
  page.on('console', m => { if (m.type() === 'error') consoleErrors.push(m.text()); });
  page.on('pageerror', e => consoleErrors.push('PAGE: ' + e.message));

  // ─── 1. Login ─────────────────────────────────────────────────────────────
  console.log('\n━━━ 1. Login ━━━');
  await page.goto(`${BASE}/login`);
  const customerBtn = page.locator('button', { hasText: /customer/i }).first();
  await customerBtn.waitFor({ timeout: 10000 }).catch(() => {});
  if (await customerBtn.isVisible()) {
    await customerBtn.click();
    ok('Clicked customer card');
  } else {
    fail('Customer card not found');
    await browser.close(); process.exit(1);
  }
  await page.waitForTimeout(2500);
  const afterLogin = new URL(page.url()).pathname;
  if (afterLogin !== '/login') ok(`Redirected after login → ${afterLogin}`);
  else                        fail('Still on /login');

  // ─── 2. Wallet page ───────────────────────────────────────────────────────
  console.log('\n━━━ 2. Wallet page ━━━');
  await page.goto(`${BASE}/customer/wallet`);
  await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});
  await page.waitForTimeout(1000);

  if (new URL(page.url()).pathname === '/customer/wallet') ok('Wallet page accessible');
  else fail('Redirected away from wallet', new URL(page.url()).pathname);

  // Check balance card renders
  const balanceText = await page.locator('text=Total Spendable Balance').isVisible();
  if (balanceText) ok('Balance card visible');
  else             fail('Balance card missing');

  // Check Top Up button
  const topUpBtn = page.locator('button', { hasText: /top up/i }).first();
  if (await topUpBtn.isVisible()) ok('Top Up button visible');
  else                            fail('Top Up button missing');

  // ─── 3. Open Top Up form ──────────────────────────────────────────────────
  console.log('\n━━━ 3. Top Up form ━━━');
  await topUpBtn.click();
  await page.waitForTimeout(400);

  const amountInput = page.locator('form input[type="number"]').first();
  if (await amountInput.isVisible()) ok('Amount input visible');
  else                               fail('Amount input missing');

  // Validation: submit empty
  await page.locator('form button[type="submit"]').first().click();
  await page.waitForTimeout(300);
  const stillOnWallet = new URL(page.url()).pathname === '/customer/wallet';
  if (stillOnWallet) ok('Empty submit stayed on wallet page');
  else               fail('Navigated away on empty submit');

  // ─── 4. Valid amount → Stripe redirect ───────────────────────────────────
  console.log('\n━━━ 4. Stripe Checkout redirect ━━━');
  await amountInput.fill('10');
  const continueBtn = page.locator('form button[type="submit"]').first();
  await continueBtn.click();

  // Wait for redirect to Stripe (checkout.stripe.com)
  let stripeReached = false;
  try {
    await page.waitForURL(/checkout\.stripe\.com/, { timeout: 15000 });
    stripeReached = true;
  } catch { /* check manually */ }

  if (stripeReached) {
    ok('Redirected to Stripe Checkout');
  } else {
    const cur = page.url();
    fail('Did not reach Stripe Checkout', cur);
    // Check for error on page
    const errMsg = await page.locator('p.text-red-500').allTextContents().catch(() => []);
    if (errMsg.length) console.error('    Error on page:', errMsg.join(' | '));
    await browser.close(); process.exit(1);
  }

  // ─── 5. Fill Stripe test card ─────────────────────────────────────────────
  console.log('\n━━━ 5. Stripe payment form ━━━');
  await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(1500);

  // Card number field (Stripe uses iframes or shadow DOM)
  const cardNumber = page.locator('[placeholder="1234 1234 1234 1234"]').or(
    page.locator('input[name="cardNumber"]')
  ).or(page.locator('[data-elements-stable-field-name="cardNumber"]'));

  try {
    await cardNumber.waitFor({ timeout: 8000 });
    await cardNumber.fill('4242 4242 4242 4242');
    ok('Card number filled');

    const expiry = page.locator('[placeholder="MM / YY"]').or(
      page.locator('input[name="cardExpiry"]')
    );
    await expiry.fill('12 / 26');
    ok('Expiry filled');

    const cvc = page.locator('[placeholder="CVC"]').or(
      page.locator('input[name="cardCvc"]')
    ).or(page.locator('[placeholder="CVV"]'));
    await cvc.fill('123');
    ok('CVC filled');

    // Name on card if present
    const nameField = page.locator('input[name="billingName"]').or(
      page.locator('[placeholder*="name" i]')
    );
    if (await nameField.isVisible({ timeout: 1000 }).catch(() => false)) {
      await nameField.fill('Test User');
    }

    // Submit payment
    const payBtn = page.locator('button[type="submit"]').filter({ hasText: /pay|subscribe|confirm/i }).first();
    await payBtn.waitFor({ timeout: 5000 });
    await payBtn.click();
    ok('Clicked Pay button');
  } catch (e) {
    fail('Could not fill Stripe card form', String(e).slice(0, 120));
    console.log('  (Stripe form structure may have changed — check browser window)');
    await browser.close(); process.exit(1);
  }

  // ─── 6. Return to wallet with success banner ──────────────────────────────
  console.log('\n━━━ 6. Post-payment return ━━━');
  try {
    await page.waitForURL(`${BASE}/customer/wallet?topup=success`, { timeout: 20000 });
    ok('Returned to /customer/wallet?topup=success');
  } catch {
    const cur = page.url();
    fail('Did not return to wallet success URL', cur);
  }

  await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});
  await page.waitForTimeout(1500);

  const successBanner = await page.locator('text=Top-up initiated').isVisible();
  if (successBanner) ok('Success banner shown');
  else               fail('Success banner missing');

  // ─── 7. Webhook fired → balance updated (allow up to 5 s) ────────────────
  console.log('\n━━━ 7. Balance update (webhook) ━━━');
  await page.waitForTimeout(5000);
  await page.reload();
  await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});
  await page.waitForTimeout(1000);

  const bodyText = await page.content();
  const hasNonZeroBalance = /RM\s+(?!0\.00)[0-9]+\.[0-9]{2}/.test(bodyText);
  if (hasNonZeroBalance) ok('Balance shows non-zero amount after top-up');
  else                   fail('Balance still shows 0.00 — webhook may not have fired (check stripe listen output)');

  const topupBucket = page.locator('text=Top-up balance');
  if (await topupBucket.isVisible()) ok('Top-up bucket label visible');
  else                               fail('Top-up bucket label missing');

  // ─── 8. Error audit ───────────────────────────────────────────────────────
  console.log('\n━━━ 8. Error audit ━━━');
  const realErrors = consoleErrors.filter(e =>
    !e.includes('Warning:') && !e.includes('favicon') && !e.includes('strict mode')
  );
  if (realErrors.length === 0) ok('No console errors');
  else fail(`${realErrors.length} console error(s)`, realErrors.slice(0, 3).join(' | '));

  // ─── Summary ──────────────────────────────────────────────────────────────
  console.log(`\n${'━'.repeat(48)}`);
  console.log(`PASSED: ${passed}   FAILED: ${failed}`);
  console.log('━'.repeat(48));
  await browser.close();
  process.exit(failed > 0 ? 1 : 0);
}

run().catch(err => { console.error(err); process.exit(1); });
