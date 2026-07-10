#!/usr/bin/env node
// Playwright E2E — withdrawal happy path + 2 error paths
// Assumes dev server on http://localhost:3000 and seed data (customer1 has RM 45)

import { chromium } from 'playwright';

const BASE = 'http://localhost:3000';
const RESULTS = [];

function log(label, ok, detail = '') {
  RESULTS.push({ label, ok });
  console.log(`  ${ok ? '✅' : '❌'} ${label}${detail ? ' — ' + detail : ''}`);
}

async function loginAs(page, email) {
  await page.goto(`${BASE}/login`);
  await page.fill('input[type="email"]',    email);
  await page.fill('input[type="password"]', 'demo123456');
  await Promise.all([
    page.waitForURL(/discovery|admin\/dashboard|vendor\/dashboard/, { timeout: 10000 }),
    page.click('button[type="submit"]'),
  ]);
}

async function readBalance(page) {
  // The "Available Balance" card is the first blue balance card
  const text = await page.locator('text=Available Balance').first().locator('..').innerText();
  const m = text.match(/RM\s?([\d,]+\.\d{2})/);
  return m ? parseFloat(m[1].replace(/,/g, '')) : NaN;
}

// ═══ Test 1: happy path ═══════════════════════════════════════
async function testHappyPath(browser) {
  console.log('\n━━━ Test 1 — Happy path (customer1 withdraws RM 15) ━━━');
  const ctx = await browser.newContext();
  const page = await ctx.newPage();

  await loginAs(page, 'customer1@demo.local');
  await page.goto(`${BASE}/wallet`);
  await page.waitForLoadState('networkidle');

  const startBalance = await readBalance(page);
  log(`Initial balance parsed: RM ${startBalance.toFixed(2)}`, startBalance > 0);

  // Open modal
  await page.click('button:has-text("Request Withdrawal")');
  const modalVisible = await page.locator('[role="dialog"]').isVisible();
  log('Modal opened', modalVisible);

  // Fill amount
  await page.fill('input[type="number"]', '15');
  await page.waitForTimeout(200);

  // Submit
  await page.click('button:has-text("Confirm")');

  // Wait for success toast
  const toastSelector = '[data-sonner-toast]';
  await page.waitForSelector(toastSelector, { timeout: 5000 }).catch(() => {});
  const toastText = await page.locator(toastSelector).first().innerText().catch(() => '');
  log('Success toast appeared', /submit/i.test(toastText), toastText.slice(0, 80));

  // Modal should close
  await page.waitForTimeout(1000);
  const modalStillOpen = await page.locator('[role="dialog"]').isVisible().catch(() => false);
  log('Modal closed after success', !modalStillOpen);

  // Balance should drop
  await page.waitForTimeout(1500);   // let router.refresh() complete
  const newBalance = await readBalance(page);
  log(
    `Balance decreased by 15`,
    Math.abs((startBalance - newBalance) - 15) < 0.01,
    `${startBalance.toFixed(2)} → ${newBalance.toFixed(2)}`,
  );

  await ctx.close();
}

// ═══ Test 2: insufficient balance ═════════════════════════════
async function testInsufficient(browser) {
  console.log('\n━━━ Test 2 — Insufficient balance ━━━');
  const ctx = await browser.newContext();
  const page = await ctx.newPage();

  await loginAs(page, 'customer1@demo.local');
  await page.goto(`${BASE}/wallet`);
  await page.waitForLoadState('networkidle');
  await page.click('button:has-text("Request Withdrawal")');
  await page.fill('input[type="number"]', '99999');
  await page.waitForTimeout(200);

  // Confirm button should be disabled by client-side balance check
  const submitDisabled = await page.locator('button:has-text("Confirm")').isDisabled();
  log('Confirm button disabled by client guard', submitDisabled);

  await ctx.close();
}

// ═══ Test 3: KYC gate at server (direct API POST, bypasses client guard) ═════
async function testKycServerGate(browser) {
  console.log('\n━━━ Test 3 — Server KYC gate (customer3, unverified) ━━━');
  const ctx = await browser.newContext();
  const page = await ctx.newPage();

  await loginAs(page, 'customer3@demo.local');
  // Direct fetch bypasses the client-side balance guard so the RPC's KYC check
  // is what should reject.
  const res = await page.evaluate(async () => {
    const r = await fetch('/api/wallet/withdraw', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Idempotency-Key': crypto.randomUUID() },
      body: JSON.stringify({ amount: 10 }),
    });
    return { status: r.status, body: await r.json() };
  });

  log(
    'Server returns 403 KYC_REQUIRED',
    res.status === 403 && res.body?.error?.code === 'KYC_REQUIRED',
    `${res.status} ${res.body?.error?.code} — "${res.body?.error?.message ?? ''}"`,
  );

  await ctx.close();
}

// ═══════════════════════════════════════════════════════════════
const browser = await chromium.launch({ headless: true });
try {
  await testHappyPath(browser);
  await testInsufficient(browser);
  await testKycServerGate(browser);

  console.log('\n━━━ SUMMARY ━━━');
  const passed = RESULTS.filter((r) => r.ok).length;
  const total  = RESULTS.length;
  console.log(`  ${passed}/${total} assertions passed`);
  RESULTS.filter((r) => !r.ok).forEach((r) => console.log(`  ❌ ${r.label}`));
  process.exit(passed === total ? 0 : 1);
} finally {
  await browser.close();
}
