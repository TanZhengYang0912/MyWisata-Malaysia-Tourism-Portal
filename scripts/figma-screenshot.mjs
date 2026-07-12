import { chromium } from '@playwright/test';
import { mkdirSync } from 'fs';

const OUT = 'scripts/figma-screenshots/local';
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
await page.setViewportSize({ width: 1440, height: 900 });

// Login as vendor
await page.goto('http://localhost:3000/login', { waitUntil: 'networkidle' });
await page.getByText('Vendor Owner').first().click();
await page.waitForURL(/vendor/, { timeout: 10000 });

async function snap(route, name) {
  await page.goto(`http://localhost:3000${route}`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: true });
  console.log(`Saved: ${name}.png`);
}

await snap('/vendor/dashboard', 'vendor-dashboard');
await snap('/vendor/wallet', 'vendor-wallet');

// Open withdrawal modal
await page.goto('http://localhost:3000/vendor/wallet', { waitUntil: 'networkidle' });
await page.waitForTimeout(1000);
await page.getByRole('button', { name: /Request Withdrawal/i }).first().click();
await page.waitForTimeout(800);
await page.screenshot({ path: `${OUT}/vendor-wallet-modal.png` });
console.log('Saved: vendor-wallet-modal.png');

await browser.close();
