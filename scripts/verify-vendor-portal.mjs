#!/usr/bin/env node
import { chromium } from 'playwright';

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext();
const page = await context.newPage();
const BASE = process.env.BASE_URL || 'http://localhost:3000';
const errors = [];
page.on('pageerror', (error) => errors.push(error.message));
page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
page.on('response', (response) => { if (response.status() >= 500) errors.push(`${response.status()} ${response.url()}`); });

await page.goto(`${BASE}/login`);
await page.fill('input[type="email"]', 'vendor.owner@demo.local');
await page.fill('input[type="password"]', 'demo123456');
await page.click('button[type="submit"]');
await page.waitForURL('**/vendor/dashboard');
await page.waitForTimeout(1200);

const dashboardText = await page.locator('body').innerText();
if (!dashboardText.includes('Total revenue') || !dashboardText.includes('Sales performance') || !dashboardText.includes('Penang Road Famous Teochew Chendul')) {
  throw new Error('Vendor dashboard did not render Supabase-backed content');
}

await page.goto(`${BASE}/vendor/dashboard?filter=12m`);
await page.waitForTimeout(800);
const readyButton = page.getByRole('button', { name: 'Mark ready' }).first();
if (await readyButton.count()) {
  await readyButton.click();
  await page.waitForTimeout(800);
  if (!await page.getByRole('button', { name: 'Fulfil' }).count()) throw new Error('Mark ready did not refresh the order action state');
}

await page.goto(`${BASE}/vendor/inbox`);
await page.waitForTimeout(800);
const inboxText = await page.locator('body').innerText();
if (!inboxText.includes('Inbox') || !inboxText.includes('Messages')) throw new Error('Vendor inbox did not render');

await page.goto(`${BASE}/vendor/analytics`);
await page.waitForTimeout(800);
const analyticsText = await page.locator('body').innerText();
if (!analyticsText.includes('Analytics') || !analyticsText.includes('Sales performance')) throw new Error('Vendor analytics did not render');

for (const path of ['/vendor/outlets', '/vendor/products', '/vendor/bookings', '/vendor/vouchers', '/vendor/orders']) {
  await page.goto(`${BASE}${path}`);
  const expectedText = path === '/vendor/products' ? 'listings in your catalogue' : path === '/vendor/outlets' ? 'outlets across Malaysia' : null;
  if (expectedText) {
    await page.waitForFunction((needle) => document.body.innerText.includes(needle), expectedText, { timeout: 10000 });
  } else {
    await page.waitForTimeout(1200);
  }
  const pageText = await page.locator('body').innerText();
  if (pageText.includes('ChunkLoadError')) throw new Error(`${path} returned ChunkLoadError`);
  if (path === '/vendor/products' && !pageText.includes('listings in your catalogue')) throw new Error('Products page did not finish loading its paginated data');
  if (path === '/vendor/outlets' && !pageText.includes('outlets across Malaysia')) throw new Error('Outlets page did not finish loading its paginated data');
}

if (errors.length) throw new Error(errors.slice(0, 3).join('\n'));
console.log(JSON.stringify({ dashboard: 'PASS', inbox: 'PASS', analytics: 'PASS', browserErrors: 0 }, null, 2));
await browser.close();
