import { chromium } from 'playwright';

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext();
const page = await context.newPage();

// Intercept /api/auth/landing response
page.on('response', async (res) => {
  if (res.url().includes('/api/auth/landing')) {
    console.log(`  [${res.status()}] ${res.url()}`);
    try { console.log('  Response body:', await res.text()); } catch {}
  }
});

console.log('▶ Login as admin@demo.local');
await page.goto('http://localhost:3000/login');
await page.fill('input[type="email"]',    'admin@demo.local');
await page.fill('input[type="password"]', 'demo123456');
await page.click('button[type="submit"]');
await page.waitForTimeout(3000);
console.log('  Final URL:', page.url());

console.log('\n▶ Direct hit /api/auth/landing with the admin session');
const response = await page.request.get('http://localhost:3000/api/auth/landing');
console.log('  Status:', response.status());
console.log('  Body:  ', await response.text());

await browser.close();
