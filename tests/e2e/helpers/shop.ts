import { expect, type Page } from '@playwright/test';
import { api, shot } from './demo';

// A stocked, plain retail item: George Town Postcard Set, RM5.00 each, sold by
// Gerakbudaya Bookshop. Not a food or booking item, so checkout has no extra steps.
export const POSTCARD = {
  productId: '3a0c59f0-fd3a-205c-818b-276ee3f8f4b2',
  name: 'George Town Postcard Set',
  unitSen: 500,
  vendorId: '31515d45-200b-dbea-0506-947f8e729943',
  vendorName: 'Gerakbudaya Bookshop',
  vendorOwner: 'owner.gerakbudaya-bookshop-penang@demo.local',
};

/** Sets the cart to exactly `quantity` of the product, then returns after the cart shows it. */
export async function fillCart(page: Page, productId: string, quantity: number, itemName: string = POSTCARD.name) {
  await page.goto(`/customer/activity/${productId}`, { waitUntil: 'domcontentloaded' });
  const add = page.getByRole('button', { name: 'Add to Cart' });
  await expect(add).toBeEnabled({ timeout: 120_000 });
  await add.click();
  await page.waitForTimeout(2500);

  await page.goto('/customer/cart', { waitUntil: 'domcontentloaded' });
  await expect(page.getByText('Select all available')).toBeVisible({ timeout: 120_000 });
  // A demo account's cart can hold many items: work only inside this item's row (the smallest
  // block that has both its name and a quantity button).
  const row = page.locator('div').filter({ hasText: itemName }).filter({ has: page.getByRole('button', { name: '−' }) }).last();
  const shown = async () => Number((await row.innerText()).match(/×\s*(\d+)/)?.[1] ?? 0);
  for (let i = 0; i < 40 && (await shown()) !== quantity; i++) {
    const before = await shown();
    await row.getByRole('button', { name: before > quantity ? '−' : '+' }).click();
    await expect.poll(shown, { timeout: 15_000 }).not.toBe(before);
  }
  expect(await shown()).toBe(quantity);
}

/** Buys `quantity` of a product with the signed-in customer through the real cart and the demo bank simulator. Returns the paid order id. */
export async function buyProduct(page: Page, productId: string, quantity: number, shotName: string, pay: 'bank' | 'wallet' = 'bank', itemName: string = POSTCARD.name): Promise<string> {
  await fillCart(page, productId, quantity, itemName);
  // Only this item: a demo account's cart may hold other things that must not be bought.
  await page.getByRole('checkbox', { name: `Select ${itemName}` }).check();
  await expect(page.getByText('1 selected').first()).toBeVisible();
  await page.getByText('Proceed to Checkout').first().click();
  await page.waitForURL(/\/customer\/checkout$/, { timeout: 120_000 });
  await page.getByRole('button', { name: pay === 'wallet' ? /MYLawatan wallet balance/ : 'Bank transfer — Demo simulator' }).click();
  await shot(page, `${shotName}_checkout`);

  // The page navigates away the moment this call returns, so read the body inside an intercept.
  let orderId = '';
  await page.route('**/api/checkout/prepare', async (route) => {
    const response = await route.fetch();
    const text = await response.text();
    expect(response.status(), text).toBeLessThan(300);
    orderId = (JSON.parse(text) as { data: { order_id: string } }).data.order_id;
    await route.fulfill({ response, body: text });
  });
  await page.getByRole('button', { name: /^(Continue|Pay with)/ }).click();

  if (pay === 'bank') {
    await page.waitForURL(/\/customer\/checkout\/simulator\//, { timeout: 120_000 });
    await expect(page.getByText('Loading…')).toHaveCount(0, { timeout: 90_000 });
    await page.getByRole('button', { name: 'Mark funds received' }).click();
  } else {
    // Wallet payments finish on the spot and land on the order page.
    await page.waitForURL(new RegExp(`/customer/orders/${orderId}`), { timeout: 120_000 });
  }
  expect(orderId, 'checkout returned an order id').toBeTruthy();
  await expect.poll(async () => {
    const order = await api(page, 'GET', `/api/customer/orders/${orderId}`);
    return JSON.stringify(order.json).match(/"status":"(\w+)"/)?.[1];
  }, { timeout: 60_000, message: 'order becomes paid after the simulated funds arrive' }).toMatch(/paid|completed/i);
  return orderId;
}

export type SettlementRow = {
  orderId: string; grossSen: number; platformFeeSen: number; vendorNetSen: number; platformRate: number;
  feeType: 'percent' | 'fixed' | 'mixed'; feeSource: 'tier' | 'event' | 'mixed'; feePerItemSen: number | null; itemCount: number | null; isSimulated: boolean; payoutFloorApplied?: boolean;
};

/** Reads a vendor's settlement for an order. Super admins may read any vendor's; owners their own. */
export async function settlementFor(page: Page, orderId: string, vendorId?: string): Promise<SettlementRow> {
  let row: SettlementRow | undefined;
  await expect.poll(async () => {
    const response = await api(page, 'GET', `/api/vendor/settlements${vendorId ? `?vendorId=${vendorId}` : ''}`);
    row = (response.json as { data?: { settlements: SettlementRow[] } } | null)?.data?.settlements.find((s) => s.orderId === orderId);
    return row !== undefined;
  }, { timeout: 60_000, message: 'a settlement exists for the paid order' }).toBe(true);
  return row as SettlementRow;
}
