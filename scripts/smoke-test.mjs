#!/usr/bin/env node
/**
 * Playwright smoke test — diagnoses login redirect + discovery product listing.
 * Run: node scripts/smoke-test.mjs
 * Assumes dev server is running on http://localhost:3000
 */

import { chromium } from 'playwright';

const BASE = 'http://localhost:3000';
const accounts = [
  { label: 'ADMIN',    email: 'admin@demo.local',           expected: '/admin/dashboard' },
  { label: 'VENDOR',   email: 'vendor.owner@demo.local',    expected: '/vendor/dashboard' },
  { label: 'CUSTOMER', email: 'customer1@demo.local',       expected: '/discovery',
    verify: async (page) => {
      // Discovery must show seeded products
      const productLinks = await page.$$('a[href^="/vendors/"]');
      const cardCount = productLinks.length;
      console.log(`  Product cards found: ${cardCount}`);
      return cardCount >= 3;   // seed has 5 products across 3 vendors
    },
  },
];

async function testAccount(browser, acc) {
  const context = await browser.newContext();
  const page    = await context.newPage();

  const consoleErrors = [];
  const networkErrors = [];
  page.on('console', (msg) => { if (msg.type() === 'error') consoleErrors.push(msg.text()); });
  page.on('pageerror', (err) => consoleErrors.push('PAGE ERROR: ' + err.message));
  page.on('requestfailed', (req) => networkErrors.push(`${req.method()} ${req.url()} — ${req.failure()?.errorText}`));
  page.on('response', (res) => {
    if (res.status() >= 400 && res.url().includes('localhost:3000')) {
      networkErrors.push(`${res.status()} ${res.url()}`);
    }
  });

  console.log(`\n━━━ ${acc.label}: ${acc.email} ━━━`);

  await page.goto(`${BASE}/login`);
  console.log('  Login page loaded:', page.url());

  await page.fill('input[type="email"]',    acc.email);
  await page.fill('input[type="password"]', 'demo123456');

  const [, ] = await Promise.all([
    page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {}),
    page.click('button[type="submit"]'),
  ]);

  await page.waitForTimeout(2000);   // let redirects settle

  const finalUrl = page.url();
  const finalPath = new URL(finalUrl).pathname;
  let match = finalPath === acc.expected;

  console.log(`  Final URL:  ${finalUrl}`);
  console.log(`  Expected:   ${acc.expected}`);
  console.log(`  URL match:  ${match ? '✅' : '❌'}`);

  if (match && acc.verify) {
    const verified = await acc.verify(page);
    console.log(`  Content:    ${verified ? '✅' : '❌'}`);
    match = match && verified;
  }
  console.log(`  Overall:    ${match ? '✅ PASS' : '❌ FAIL'}`);

  // Grab visible text on the landing page to see what actually rendered
  const bodyText = await page.evaluate(() => document.body.innerText.slice(0, 500));
  console.log('  Landing content preview:');
  console.log('    ' + bodyText.split('\n').filter(Boolean).slice(0, 8).join('\n    '));

  if (consoleErrors.length) {
    console.log('  Console errors:');
    consoleErrors.slice(0, 5).forEach((e) => console.log('    ✗ ' + e.slice(0, 200)));
  }
  if (networkErrors.length) {
    console.log('  Network 4xx/5xx / failed:');
    networkErrors.slice(0, 5).forEach((e) => console.log('    ✗ ' + e.slice(0, 200)));
  }

  // Screenshot for evidence
  const shotPath = `scripts/screenshot-${acc.label.toLowerCase()}.png`;
  await page.screenshot({ path: shotPath, fullPage: true });
  console.log(`  Screenshot: ${shotPath}`);

  await context.close();
  return match;
}

const browser = await chromium.launch({ headless: true });
try {
  const results = [];
  for (const acc of accounts) {
    results.push({ acc: acc.label, ok: await testAccount(browser, acc) });
  }
  console.log('\n━━━ SUMMARY ━━━');
  results.forEach((r) => console.log(`  ${r.ok ? '✅' : '❌'} ${r.acc}`));
} finally {
  await browser.close();
}
