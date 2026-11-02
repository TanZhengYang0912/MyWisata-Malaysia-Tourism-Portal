import { expect, test } from '@playwright/test';

test.use({ trace: 'off' });

test('the Guest link exchange is shared by StrictMode effects and removed from the URL', async ({ page }) => {
  await page.route('**/api/guest/cart', (route) => route.fulfill({ json: { data: { items: [] }, error: null } }));
  let exchanges = 0;
  const orderId = '1d4057cf-c821-4b05-a454-61dbdc42d32c';
  await page.route('**/api/guest/orders/access', async (route) => {
    exchanges += 1;
    expect(route.request().postDataJSON()).toEqual({ token: 'A'.repeat(43) });
    await route.fulfill({ json: { data: { orderId }, error: null } });
  });

  await page.goto(`/customer/orders/access#token=${'A'.repeat(43)}`);
  await page.waitForURL(`**/customer/orders/${orderId}`);
  expect(exchanges).toBe(1);
  expect(page.url()).not.toContain('token=');
});

test('Guest recovery accepts a public order number and keeps the result generic', async ({ page }) => {
  await page.route('**/api/guest/cart', (route) => route.fulfill({ json: { data: { items: [] }, error: null } }));
  let recoveryRequest: Record<string, unknown> | null = null;
  await page.route('**/api/guest/orders/recover', async (route) => {
    recoveryRequest = route.request().postDataJSON();
    await route.fulfill({ json: { data: { message: 'If the details match a guest order, an access link will be emailed.' }, error: null } });
  });

  await page.goto('/customer/orders/access');
  await expect(page.getByRole('heading', { name: 'Access your guest order' })).toBeVisible();
  await page.getByLabel('Order number (optional)').fill('#ord-2026-0042');
  await page.getByLabel('Contact email').fill('guest+aftercare@example.com');
  await page.getByRole('button', { name: 'Email me an order link' }).click();
  await expect(page.getByRole('status')).toContainText('If the details match');
  expect(recoveryRequest).toEqual({ orderReference: '#ord-2026-0042', email: 'guest+aftercare@example.com' });
});


test('serializes consecutive Guest exchanges so their session cookies cannot arrive out of order', async ({ page }) => {
  const orderA='00000000-0000-4000-8000-000000000001';
  const orderB='00000000-0000-4000-8000-000000000002';
  let release!:()=>void;const gate=new Promise<void>(resolve=>{release=resolve;});
  let calls=0;
  await page.route('**/api/guest/cart',route=>route.fulfill({json:{data:{items:[]}}}));
  await page.route('**/api/guest/orders/access',async route=>{
    calls++;
    const first=route.request().postDataJSON().token==='A'.repeat(43);
    if(first)await gate;
    else expect(route.request().headers().cookie).toContain('qa-order-session=A');
    await route.fulfill({headers:{'Set-Cookie':`qa-order-session=${first?'A':'B'}; Path=/; HttpOnly; SameSite=Lax`},json:{data:{orderId:first?orderA:orderB},error:null}});
  });
  await page.goto(`/customer/orders/access#token=${'A'.repeat(43)}`);
  await expect.poll(()=>calls).toBe(1);
  await page.evaluate(token=>{window.location.hash=`token=${token}`;},'B'.repeat(43));
  await expect(page).not.toHaveURL(/token=/);
  await page.evaluate(()=>new Promise<void>(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve()))));
  expect(calls).toBe(1);
  release();
  await page.waitForURL(`**/customer/orders/${orderB}`);
  expect(calls).toBe(2);
  expect((await page.context().cookies()).find(cookie=>cookie.name==='qa-order-session')?.value).toBe('B');
});
