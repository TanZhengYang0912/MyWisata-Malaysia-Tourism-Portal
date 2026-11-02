import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import { PortalFixture, installPortalFixtureCleanup } from './helpers/portal-fixture';

const output = process.env.OWNED_FLOW_E2E_ARTIFACTS ?? join(process.cwd(), 'e2e-shots', 'owned-flow-recovery');
mkdirSync(output, { recursive: true });
installPortalFixtureCleanup();
test.use({ trace: 'off', actionTimeout: 15_000 });
test.describe.configure({ retries: 0 });
test.setTimeout(180_000);

function order(n: number) {
  return { id: `00000000-0000-4000-8000-${String(n).padStart(12,'0')}`, displayId: `ORD-QA-${n}`, userId: 'synthetic',
    status: 'PAID', total: 10, subtotal: 10, discount: 0, createdAt: '2026-10-30T01:00:00Z',
    items: [{ activityId: '', activityName: `Synthetic product ${n}`, variantLabel: 'Standard', unitPrice: 10, qty: 1, outletId: '' }] };
}

test('order failures, retries, page filters and stale responses preserve the visible contract', async ({ page, baseURL }) => {
  test.skip(!process.env.PORTAL_E2E_TEST_DB_CONFIRM, 'Requires explicit confirmation of the authorized test project.');
  const fixture = new PortalFixture();
  try {
    const account = await fixture.createAccount();
    await fixture.authenticateCustomer(page.context(), account, baseURL!);
    await page.request.post('/api/locale', { data: { locale: 'en' } });
    const real = await page.request.get('/api/customer/orders');
    expect(real.status()).toBe(200);
    expect((await real.json()).data.total).toBe(0);
    expect((await page.request.get('/api/customer/orders?userId=other')).status()).toBe(400);
    let unavailable = true;
    const requests: URL[] = [];
    await page.route('**/api/customer/orders?*', async route => {
      const url = new URL(route.request().url()); requests.push(url);
      if (unavailable) return route.fulfill({ status: 503, json: { error: 'orders_unavailable' } });
      const query = url.searchParams.get('query');
      if (query === 'old') await new Promise(resolve => setTimeout(resolve, 300));
      const total = query === 'no-match' ? 0 : query ? 1 : 23;
      const pageNumber = Math.min(Number(url.searchParams.get('page')), Math.max(1,Math.ceil(total/10)));
      const rows = Array.from({ length: Math.min(10, Math.max(0,total-(pageNumber-1)*10)) }, (_,i) => order((pageNumber-1)*10+i+1));
      if (query) rows.forEach(row=>{row.items[0].activityName=query;});
      return route.fulfill({ json: { data: { orders: rows, total, page: pageNumber, pageSize: 10, outlets: [], stats: { total: 23, paid: 23, bookings: 0 } } } });
    });
    await page.goto('/customer/orders');
    await expect(page.locator('main').getByRole('alert')).toBeVisible();
    await expect(page.getByText('No orders yet', { exact: true })).toHaveCount(0);
    await expect(page.getByRole('button',{name:'Retry',exact:true})).toBeVisible();
    await page.screenshot({ path: join(output,'orders-first-failure-desktop.png'),fullPage:true });
    await page.getByRole('button',{name:'Retry',exact:true}).click();
    unavailable = false;
    await expect(page.getByText('1× Synthetic product 1',{exact:true})).toBeVisible();
    await page.getByRole('button',{name:'Next page',exact:true}).click();
    await expect(page.getByText('1× Synthetic product 11',{exact:true})).toBeVisible();
    await page.screenshot({ path: join(output,'orders-page-two-desktop.png'),fullPage:true });
    unavailable = true;
    await page.evaluate(()=>window.dispatchEvent(new Event('focus')));
    await expect(page.locator('main').getByRole('alert')).toBeVisible();
    await expect(page.getByText('1× Synthetic product 11',{exact:true})).toBeVisible();
    await page.screenshot({ path: join(output,'orders-revalidation-failure.png'),fullPage:true });
    await page.getByRole('button',{name:'Retry',exact:true}).click();
    unavailable = false;
    await expect(page.locator('main').getByRole('alert')).toHaveCount(0);
    const search = page.getByRole('textbox',{name:/search/i});
    await search.fill('no-match');
    await expect(page.getByText('1× Synthetic product 11',{exact:true})).toHaveCount(0);
    await expect.poll(()=>requests.at(-1)?.searchParams.get('page')).toBe('1');
    await expect(page.locator('main').getByText('No orders match these filters', {exact:true})).toBeVisible();
    await page.screenshot({ path: join(output,'orders-filter-no-results.png'),fullPage:true });
    await search.fill('old');
    await page.waitForRequest(r=>new URL(r.url()).searchParams.get('query')==='old');
    await search.fill('new');
    await expect(page.getByText('1× new',{exact:true})).toBeVisible();
    await expect(page.getByText('1× old',{exact:true})).toHaveCount(0);
    for (const locale of ['en','ms','zh-CN']) {
      await page.request.post('/api/locale',{data:{locale}});
      await page.setViewportSize({width:390,height:844});
      await page.reload();
      await expect(page.getByText('1× Synthetic product 1',{exact:true})).toBeVisible();
      await page.screenshot({path:join(output,`orders-mobile-${locale}.png`),fullPage:true});
      unavailable = true;
      await page.evaluate(()=>window.dispatchEvent(new Event('focus')));
      await expect(page.locator('main').getByRole('alert')).toBeVisible();
      await page.screenshot({path:join(output,`orders-error-mobile-${locale}.png`),fullPage:true});
      unavailable = false;
    }
  } finally { await fixture.cleanup(); }
});

test('Guest email-only recovery is visible on new devices and after invalid links', async ({ page }) => {
  await page.route('**/api/guest/cart', route=>route.fulfill({json:{data:{items:[]}}}));
  await page.route('**/api/guest/orders/access', route=>route.fulfill({status:401,json:{error:'invalid_access'}}));
  let submitted: Record<string,unknown> | null = null;
  await page.route('**/api/guest/orders/recover', route=>{
    submitted=route.request().postDataJSON();
    return route.fulfill({json:{data:{message:'If the details match a guest order, an access link will be emailed.'}}});
  });
  for (const locale of ['en','ms','zh-CN']) {
    await page.request.post('/api/locale',{data:{locale}});
    await page.setViewportSize({width:390,height:844});
    await page.goto(`/customer/orders/access#token=${'A'.repeat(43)}`);
    await expect(page.locator('form')).toBeVisible();
    await expect(page).not.toHaveURL(/token=/);
    await page.locator('input[type=email]').fill('synthetic@example.invalid');
    await page.locator('button[type=submit]').click();
    await expect(page.getByRole('status')).toBeVisible();
    expect(submitted).toEqual({email:'synthetic@example.invalid'});
    await page.screenshot({path:join(output,`guest-recovery-mobile-${locale}.png`),fullPage:true});
  }
});

test('bounded API read workload uses isolated owners at 1, 5 and 10 concurrent users', async ({ browser, baseURL }) => {
  test.skip(!process.env.PORTAL_E2E_TEST_DB_CONFIRM, 'Requires explicit confirmation of the authorized test project.');
  const fixture = new PortalFixture();
  const contexts: Awaited<ReturnType<typeof browser.newContext>>[] = [];
  const measurements: {users:number;requests:number;p50Ms:number;p95Ms:number;responseBytes:number;errors:number}[]=[];
  try {
    for(let i=0;i<10;i++) {
      const account=await fixture.createAccount();
      const context=await browser.newContext({baseURL});contexts.push(context);
      await fixture.authenticateCustomer(context,account,baseURL!);
    }
    for(const users of [1,5,10]) {
      const times:number[]=[];let bytes=0;let errors=0;
      await Promise.all(contexts.slice(0,users).map(async context=>{
        for(let n=0;n<2;n++) {
          const start=performance.now();const response=await context.request.get('/api/customer/orders',{timeout:20_000});
          const body=await response.body();times.push(performance.now()-start);bytes+=body.byteLength;
          if(!response.ok())errors++;
          expect(response.status()).toBe(200);expect(JSON.parse(body.toString()).data.total).toBe(0);
        }
      }));
      times.sort((a,b)=>a-b);
      measurements.push({users,requests:times.length,p50Ms:times[Math.floor(times.length*.5)],p95Ms:times[Math.min(times.length-1,Math.floor(times.length*.95))],responseBytes:bytes,errors});
    }
    const sameOwnerTimes:number[]=[];
    await Promise.all(Array.from({length:5},async()=>{
      const start=performance.now();const response=await contexts[0].request.get('/api/customer/orders',{timeout:20_000});
      sameOwnerTimes.push(performance.now()-start);expect(response.status()).toBe(200);
    }));
    writeFileSync(join(output,'synthetic-read-load.json'),JSON.stringify({sameOwnerConcurrentReads:{requests:5,errors:0,durationsMs:sameOwnerTimes},scope:'local Next.js + authorized test DB, empty synthetic owner histories',productionCapacityCertified:false,measurements},null,2));
  } finally { await Promise.all(contexts.map(context=>context.close()));await fixture.cleanup(); }
});
