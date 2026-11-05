import {randomUUID} from 'node:crypto';
import {expect,test} from '@playwright/test';
import {authenticatedTestDatabase,installTripFixtureCleanup,createTestCustomer,rest,signInTestCustomer} from './helpers/trip-fixture';

test.setTimeout(180_000);
test.describe.configure({retries:0});
test.use({actionTimeout:30_000});
installTripFixtureCleanup();
test('owned itinerary persists daily starts, rejects invalid origins and preserves failed mutations',async({page,request})=>{
  const tripId=randomUUID();const customer=await createTestCustomer(tripId,request);
  const date=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Kuala_Lumpur'}).format(new Date(Date.now()+86400000));
  const next=new Date(`${date}T00:00:00Z`);next.setUTCDate(next.getUTCDate()+1);const day2=next.toISOString().slice(0,10);
  await rest(request,'POST','trips',{id:tripId,user_id:customer.id,name:'E2E reliability',start_date:date,end_date:day2});
  const origin={id:randomUUID(),trip_id:tripId,source:'location',lat:3.139,lng:101.687,label:'KL start',sequence:0,scheduled_date:null as string | null,scheduled_time:null as string | null};
  const a={...origin,id:randomUUID(),label:'Stop A',lat:3.16,lng:101.7,sequence:1,scheduled_date:date,scheduled_time:'10:00'};
  const b={...a,id:randomUUID(),label:'Stop B',lat:3.17,lng:101.72,sequence:2,scheduled_time:'11:00'};
  await rest(request,'POST','trip_items',[origin,a,b]);
  await signInTestCustomer(page,customer);
  await page.request.post('/api/locale',{data:{locale:'en'}});
  const routePointCalls:[number,number][][]=[];
  await page.route('**/api/route',async route=>{
    const {points}=route.request().postDataJSON() as {points:[number,number][]};
    routePointCalls.push(points);
    await route.fulfill({json:{data:{routes:[{geometry:points,distanceKm:10,durationMin:20,hasTolls:false,legs:points.slice(1).map(()=>({durationMin:10,distanceKm:5})),traffic:{provider:'mapbox',basis:'predicted',retrievedAt:new Date().toISOString(),segments:[{level:'normal',geometry:points},{level:'slow',geometry:points},{level:'congested',geometry:points},{level:'severe',geometry:points}]}}]}}});
  });
  await page.route('**/api/weather/forecast',route=>route.fulfill({json:{data:{results:{}}}}));
  await page.route('**/api/weather/overlay',route=>route.fulfill({status:503,json:{data:null,error:{code:'TEST_PROVIDER_UNAVAILABLE'}}}));
  await page.route('**/api/geocode?**',route=>route.fulfill({json:{data:{results:[{label:'Melaka day start',lat:2.2,lng:102.25}]}}}));
  await page.route('https://tiles.openfreemap.org/styles/liberty',route=>route.fulfill({json:{version:8,sources:{},layers:[]}}));
  await page.goto(`/customer/trip/${tripId}`);
  await expect(page.getByText('Loading…',{exact:true})).toHaveCount(0,{timeout:90_000});
  await expect(page.getByText('KL start',{exact:false}).first()).toBeVisible();
  await expect.poll(()=>routePointCalls.length).toBeGreaterThan(0);
  const day=page.locator(`[data-trip-day="${date}"]`);
  await day.getByRole('button',{name:'Remove Stop A'}).waitFor();
  // A real domain rejection returns a valid Action error, rather than breaking the framework transport.
  const time=day.getByLabel('Time for Stop B',{exact:true});
  await time.fill('09:00');
  await expect(page.getByRole('dialog')).toBeVisible({timeout:30_000});
  await page.screenshot({path:test.info().outputPath('trip-invalid-change.png'),fullPage:true});
  await page.getByRole('dialog').getByRole('button',{name:'Close',exact:true}).first().click();
  await expect(time).toHaveValue(/^11:00(:00)?$/);
  expect(await rest(request,'GET',`trip_items?select=scheduled_time&id=eq.${b.id}`)).toEqual([{scheduled_time:'11:00:00'}]);
  await page.locator('#planner-selected-day').selectOption(day2);
  await page.getByRole('button',{name:'Change starting point',exact:true}).click();
  await page.getByLabel('Apply starting point to').selectOption('day');
  await page.getByPlaceholder('Type your location…').fill('Melaka');
  const originSaved=page.waitForResponse(response=>response.request().method()==='POST' && new URL(response.url()).pathname===`/customer/trip/${tripId}`,{timeout:60_000});
  await page.getByRole('button',{name:'Melaka day start',exact:true}).click();
  expect((await originSaved).status()).toBe(200);
  await expect.poll(async()=>rest(request,'GET',`trip_items?select=id&trip_id=eq.${tripId}&is_day_origin=eq.true`)).toHaveLength(1);
  const [daily]=await rest<Array<{id:string}>>(request,'GET',`trip_items?select=id&trip_id=eq.${tripId}&is_day_origin=eq.true`);
  await expect(rest(request,'POST','trip_items',{...origin,id:randomUUID(),is_day_origin:true,scheduled_date:day2})).rejects.toThrow();
  await expect(rest(request,'POST','trip_items',{...origin,id:randomUUID(),is_day_origin:true})).rejects.toThrow();
  await page.reload();await page.locator('#planner-selected-day').selectOption(day2);
  await expect(page.getByText('This day only · Melaka day start')).toBeVisible();
  await page.screenshot({path:test.info().outputPath('trip-desktop.png'),fullPage:true});
  const otherTripId=randomUUID();
  const other=await createTestCustomer(otherTripId,request);
  // Other-user row is seeded only for this run; authenticated owner cannot change/read it.
  const otherTrip=(await rest<Array<{id:string}>>(request,'POST','trips',{id:otherTripId,user_id:other.id,name:'Other test trip',start_date:date,end_date:day2}))[0];
  const otherRow=(await rest<Array<{id:string}>>(request,'POST','trip_items',{...origin,id:randomUUID(),trip_id:otherTrip.id}))[0];
  const ownDb=authenticatedTestDatabase(customer,request);
  expect((await ownDb.from('trip_items').select('id').eq('id',otherRow.id)).data).toEqual([]);
  expect((await ownDb.from('trip_items').update({label:'Forbidden'}).eq('id',otherRow.id).select('id')).error?.code).toBe('42501');
  // Register this extra Trip for cleanup by deleting it explicitly before account cleanup.
  await rest(request,'DELETE',`trips?id=eq.${otherTrip.id}&user_id=eq.${other.id}`);
  expect((await ownDb.from('trip_items').select('id').eq('id',daily.id)).data).toHaveLength(1);
  // Adding a day start after existing stops must place it first in both the persisted
  // timeline and the route sent to the routing API.
  await page.locator('#planner-selected-day').selectOption(date);
  await page.getByRole('button',{name:'Change starting point',exact:true}).click();
  await page.getByLabel('Apply starting point to').selectOption('day');
  await page.getByPlaceholder('Type your location…').fill('Melaka');
  const firstDayOriginSaved=page.waitForResponse(response=>response.request().method()==='POST' && new URL(response.url()).pathname===`/customer/trip/${tripId}`,{timeout:60_000});
  await page.getByRole('button',{name:'Melaka day start',exact:true}).click();
  expect((await firstDayOriginSaved).status()).toBe(200);
  await expect.poll(async()=>rest<Array<{id:string}>>(request,'GET',`trip_items?select=id&trip_id=eq.${tripId}&is_day_origin=eq.true&scheduled_date=eq.${date}`)).toHaveLength(1);
  const [firstDayOrigin]=await rest<Array<{id:string}>>(request,'GET',`trip_items?select=id&trip_id=eq.${tripId}&is_day_origin=eq.true&scheduled_date=eq.${date}`);
  const orderedItems=await rest<Array<{id:string;sequence:number}>>(request,'GET',`trip_items?select=id,sequence&trip_id=eq.${tripId}&order=sequence.asc`);
  const itemOrder=orderedItems.map(item=>item.id);
  expect(itemOrder.indexOf(firstDayOrigin.id)).toBeLessThan(itemOrder.indexOf(a.id));
  expect(itemOrder.indexOf(a.id)).toBeLessThan(itemOrder.indexOf(b.id));
  await expect(page.locator(`[data-trip-day="${date}"] ul > li`)).toContainText(['Melaka day start','Stop A','Stop B']);
  await expect.poll(()=>routePointCalls.some(points=>JSON.stringify(points)===JSON.stringify([[2.2,102.25],[3.16,101.7],[3.17,101.72]])),{timeout:30_000}).toBe(true);

  const removeFirstDayOrigin=page.waitForResponse(response=>response.request().method()==='POST' && new URL(response.url()).pathname===`/customer/trip/${tripId}`,{timeout:60_000});
  await page.getByRole('button',{name:'Use trip starting point again',exact:true}).click();
  expect((await removeFirstDayOrigin).status()).toBe(200);
  await page.locator('#planner-selected-day').selectOption(day2);
  const originRestored=page.waitForResponse(response=>response.request().method()==='POST' && new URL(response.url()).pathname===`/customer/trip/${tripId}`,{timeout:60_000});
  await page.getByRole('button',{name:'Use trip starting point again',exact:true}).click();
  expect((await originRestored).status()).toBe(200);
  await expect.poll(async()=>rest(request,'GET',`trip_items?select=id&trip_id=eq.${tripId}&is_day_origin=eq.true`),{timeout:30_000}).toEqual([]);
  await page.setViewportSize({width:390,height:844});
  await expect(page.locator('#planner-selected-day')).toBeVisible();
  await page.screenshot({path:test.info().outputPath('trip-mobile.png'),fullPage:true});
  await page.getByRole('button',{name:'Map',exact:true}).click();
  await expect(page.locator('[data-trip-route-map]')).toBeVisible();
  // Clear belongs to the itinerary panel; mobile tabs intentionally hide the other panels.
  await page.getByRole('button',{name:'Itinerary',exact:true}).click();
  // Commit a write, then lose only the browser response. Verification reads the
  // saved state rather than repeating the write or adding another stop.
  await page.locator('#planner-selected-day').selectOption(date);
  let loseNextResponse=true;
  const cdp=await page.context().newCDPSession(page);
  await cdp.send('Fetch.enable',{patterns:[{urlPattern:page.url().split('?')[0],requestStage:'Response'}]});
  cdp.on('Fetch.requestPaused',async event=>{
    if(event.request.method!=='POST' || !loseNextResponse) {
      await cdp.send('Fetch.continueResponse',{requestId:event.requestId});return;
    }
    loseNextResponse=false;
    await expect.poll(async()=>rest(request,'GET',`trip_items?select=scheduled_time&id=eq.${b.id}`)).toEqual([{scheduled_time:'11:30:00'}]);
    await cdp.send('Fetch.failRequest',{requestId:event.requestId,errorReason:'Failed'});
  });
  await day.getByLabel('Time for Stop B',{exact:true}).fill('11:30');
  await expect(page.getByRole('dialog')).toContainText('Check the saved trip');
  await cdp.send('Fetch.disable');
  await page.screenshot({path:test.info().outputPath('trip-result-unknown.png'),fullPage:true});
  expect(await rest(request,'GET',`trip_items?select=scheduled_time&id=eq.${b.id}`)).toEqual([{scheduled_time:'11:30:00'}]);
  await page.getByRole('dialog').getByRole('button',{name:'Close',exact:true}).first().click();
  await page.getByRole('button',{name:'Check saved trip',exact:true}).click();
  await expect(day.getByLabel('Time for Stop B',{exact:true})).toHaveValue(/^11:30(:00)?$/);
  await rest(request,'PATCH',`trips?id=eq.${tripId}&user_id=eq.${customer.id}`,{updated_at:new Date().toISOString()});
  await day.getByLabel('Time for Stop B',{exact:true}).fill('11:45');
  await expect(page.getByRole('dialog')).toContainText('changed in another session');
  await page.screenshot({path:test.info().outputPath('trip-version-conflict.png'),fullPage:true});
  await page.getByRole('dialog').getByRole('button',{name:'Close',exact:true}).first().click();
  await page.getByRole('button',{name:'Check saved trip',exact:true}).click();
  await expect(page.locator('main').getByRole('alert')).toHaveCount(0);
  await page.getByRole('button',{name:'Clear itinerary items',exact:true}).click();
  const cleared=page.waitForResponse(response=>response.request().method()==='POST' && new URL(response.url()).pathname===`/customer/trip/${tripId}`,{timeout:60_000});
  await page.getByRole('dialog').getByRole('button',{name:'Confirm',exact:true}).click();
  expect((await cleared).status()).toBe(200);
  await expect.poll(async()=>rest(request,'GET',`trip_items?select=id&trip_id=eq.${tripId}`)).toEqual([]);
  expect(await rest(request,'GET',`trips?select=name&id=eq.${tripId}`)).toEqual([{name:'E2E reliability'}]);
});
