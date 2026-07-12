#!/usr/bin/env node
/**
 * Diagnostic script for profile management flow.
 * Tests: login (card picker) → profile fill → save → tier upgrade → KYC page.
 * Run: node scripts/diag-profile.mjs
 * Requires dev server on http://localhost:3000
 */
import { chromium } from 'playwright';

const BASE = 'http://localhost:3000';

let passed = 0;
let failed = 0;

function ok(label)          { console.log(`  ✓ ${label}`); passed++; }
function fail(label, detail = '') { console.error(`  ✗ ${label}${detail ? ': ' + detail : ''}`); failed++; }

async function run() {
  const browser = await chromium.launch({ headless: true });
  const ctx  = await browser.newContext();
  const page = await ctx.newPage();

  const consoleErrors = [];
  const networkErrors = [];
  page.on('console', m => { if (m.type() === 'error') consoleErrors.push(m.text()); });
  page.on('pageerror', e => consoleErrors.push('PAGE: ' + e.message));
  page.on('response', r => {
    if (r.status() >= 400 && r.url().includes('supabase')) {
      networkErrors.push(`${r.status()} ${r.url().split('?')[0].split('/rest/')[1] ?? r.url()}`);
    }
  });

  // ─── 1. Login via card picker ─────────────────────────────────────────────
  console.log('\n━━━ 1. Login (card picker) ━━━');
  await page.goto(`${BASE}/login`);
  // Wait for demo accounts to load (fetched from /api/auth/demo-users)
  const customerBtn = page.locator('button', { hasText: /customer/i }).first();
  await customerBtn.waitFor({ timeout: 10000 }).catch(() => {});

  if (await customerBtn.isVisible()) {
    const btnText = await customerBtn.textContent();
    console.log(`  Found button: "${btnText?.trim().replace(/\s+/g, ' ')}"`);
    await customerBtn.click();
    ok('Customer button clicked');
  } else {
    fail('Customer button not found on login page');
    await browser.close();
    process.exit(1);
  }

  // Wait for redirect after login
  await page.waitForTimeout(2500);
  const afterLogin = new URL(page.url()).pathname;
  if (afterLogin !== '/login') ok(`Redirected after login → ${afterLogin}`);
  else                        fail('Still on /login after clicking customer');

  // ─── 2. Navigate to profile page ──────────────────────────────────────────
  console.log('\n━━━ 2. Profile page ━━━');
  await page.goto(`${BASE}/customer/profile`);
  await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});
  await page.waitForTimeout(1000);

  const profilePath = new URL(page.url()).pathname;
  if (profilePath === '/customer/profile') ok('Profile page accessible (not redirected)');
  else                                     fail('Redirected away from profile', profilePath);

  const nameInput  = page.locator('input[placeholder*="Ahmad"]');
  const cityInput  = page.locator('input[placeholder*="Kuala"]');
  const phoneInput = page.locator('input[type="tel"]');

  if (await nameInput.isVisible())  ok('Full Name input visible');
  else                              fail('Full Name input missing');
  if (await cityInput.isVisible())  ok('City input visible');
  else                              fail('City input missing');
  if (await phoneInput.isVisible()) ok('Phone input visible');
  else                              fail('Phone input missing');

  // ─── 3. Validation — empty submit ─────────────────────────────────────────
  console.log('\n━━━ 3. Empty-form validation ━━━');
  await nameInput.fill('');
  await cityInput.fill('');
  await phoneInput.fill('');
  await page.click('button[type="submit"]');
  await page.waitForTimeout(500);

  const errors = await page.locator('p.text-xs.text-destructive').allTextContents();
  if (errors.some(e => /name/i.test(e)))  ok('Full name error shown');
  else                                    fail('Full name error missing', JSON.stringify(errors));
  if (errors.some(e => /city/i.test(e)))  ok('City error shown');
  else                                    fail('City error missing', JSON.stringify(errors));
  if (errors.some(e => /phone/i.test(e))) ok('Phone error shown');
  else                                    fail('Phone error missing', JSON.stringify(errors));

  if (new URL(page.url()).pathname === '/customer/profile') ok('Page stayed on profile after empty submit');
  else                                                      fail('Navigated away despite empty form');

  // ─── 4. Validation — invalid phone ────────────────────────────────────────
  console.log('\n━━━ 4. Invalid phone validation ━━━');
  await nameInput.fill('Test User');
  await cityInput.fill('Kuala Lumpur');
  await phoneInput.fill('123');
  await page.click('button[type="submit"]');
  await page.waitForTimeout(500);

  const phoneErrs = await page.locator('p.text-xs.text-destructive').allTextContents();
  if (phoneErrs.some(e => /malaysian|phone|valid/i.test(e))) ok('Invalid phone error shown');
  else                                                       fail('Invalid phone error missing', JSON.stringify(phoneErrs));

  // ─── 5. Valid save → redirect to /customer/kyc ────────────────────────────
  console.log('\n━━━ 5. Valid save → DB update → redirect ━━━');
  await nameInput.fill('Diagnostic User');
  await cityInput.fill('Petaling Jaya');
  await phoneInput.fill('0123456789');

  // Capture any supabase errors during submission
  const preSaveNetErrors = [...networkErrors];
  await page.click('button[type="submit"]');

  let kycReached = false;
  try {
    await page.waitForURL(`${BASE}/customer/kyc`, { timeout: 12000 });
    kycReached = true;
  } catch { /* check URL manually */ }

  await page.waitForTimeout(1500);
  const afterSave = new URL(page.url()).pathname;

  if (afterSave === '/customer/kyc' || kycReached) ok('Redirected to /customer/kyc after save');
  else {
    fail('Did not reach /customer/kyc', afterSave);
    // Capture any server error shown on page
    const serverErr = await page.locator('p.text-xs.text-destructive').allTextContents();
    if (serverErr.length) console.error('    Server errors on page:', JSON.stringify(serverErr));
  }

  const postSaveNetErrors = networkErrors.filter(e => !preSaveNetErrors.includes(e));
  if (postSaveNetErrors.length) {
    fail('Supabase errors during save', postSaveNetErrors.join(' | '));
  } else {
    ok('No Supabase errors during save');
  }

  // ─── 6. KYC page renders correctly ────────────────────────────────────────
  if (afterSave === '/customer/kyc') {
    console.log('\n━━━ 6. KYC page content ━━━');
    await page.waitForLoadState('networkidle', { timeout: 8000 }).catch(() => {});

    const body = await page.content();
    const kycErrorBanners = await page.locator('[class*="text-destructive"]').allTextContents();

    if (/submit your kyc|kyc under review|kyc verified|profile.complete/i.test(body))
      ok('KYC page shows relevant content');
    else
      fail('KYC page content unclear', 'no expected heading found');

    if (kycErrorBanners.length === 0) ok('No error banners on KYC page');
    else                              fail('Error banner(s) on KYC page', JSON.stringify(kycErrorBanners));
  }

  // ─── 7. Profile page pre-populates on revisit ─────────────────────────────
  console.log('\n━━━ 7. Pre-population after save ━━━');
  await page.goto(`${BASE}/customer/profile`);
  await page.waitForLoadState('networkidle', { timeout: 8000 }).catch(() => {});
  await page.waitForTimeout(1200);

  const nameVal  = await nameInput.inputValue().catch(() => '');
  const cityVal  = await cityInput.inputValue().catch(() => '');
  const phoneVal = await phoneInput.inputValue().catch(() => '');

  if (nameVal)  ok(`Name pre-populated: "${nameVal}"`);
  else          fail('Name not pre-populated');
  if (cityVal)  ok(`City pre-populated: "${cityVal}"`);
  else          fail('City not pre-populated');
  if (phoneVal) ok(`Phone pre-populated: "${phoneVal}"`);
  else          fail('Phone not pre-populated');

  // ─── 8. Tier badge on profile page ────────────────────────────────────────
  console.log('\n━━━ 8. Tier badge ━━━');
  const profileBody = await page.content();
  if (/profile complete|kyc under review|kyc verified/i.test(profileBody))
    ok('Tier badge shows elevated tier (trigger fired)');
  else if (/registered/i.test(profileBody))
    fail('Tier still "Registered" — DB trigger may not have fired');
  else
    fail('No recognisable tier badge found');

  // ─── 9. Console / network error audit ─────────────────────────────────────
  console.log('\n━━━ 9. Error audit ━━━');
  const realErrors = consoleErrors.filter(e =>
    !e.includes('Warning:') && !e.includes('strict mode') && !e.includes('favicon')
  );
  if (realErrors.length === 0) ok('No console errors');
  else fail(`${realErrors.length} console error(s)`, realErrors.slice(0, 3).join(' | '));

  if (networkErrors.length === 0) ok('No Supabase 4xx/5xx errors');
  else fail(`${networkErrors.length} Supabase error(s)`, networkErrors.slice(0, 3).join(' | '));

  // ─── Summary ──────────────────────────────────────────────────────────────
  console.log(`\n${'━'.repeat(48)}`);
  console.log(`PASSED: ${passed}   FAILED: ${failed}`);
  console.log('━'.repeat(48));
  await browser.close();
  process.exit(failed > 0 ? 1 : 0);
}

run().catch(err => { console.error(err); process.exit(1); });
