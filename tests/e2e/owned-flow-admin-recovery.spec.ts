import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import { PortalFixture, installPortalFixtureCleanup } from './helpers/portal-fixture';
import { authenticateStaff, passwordLogin } from './helpers/staff-auth';
const output=process.env.OWNED_FLOW_E2E_ARTIFACTS ?? join(process.cwd(),'e2e-shots','owned-flow-recovery');
installPortalFixtureCleanup();
test.setTimeout(240_000);
test('authorized temporary Super Admin sees the overdue queue and synthetic review history',async({page})=>{
  test.skip(process.env.PORTAL_E2E_RECOVERY_ACCEPTANCE!=='1','Run through the bounded administrator acceptance runner.');
  const fixture=new PortalFixture();
  try {
    const account=await fixture.createAccount('super_admin');
    await passwordLogin(page,account);
    writeFileSync(join(process.env.PORTAL_E2E_CAPTCHA_WINDOW!,'passwords-ready'),'ready',{mode:0o600});
    const auth=await authenticateStaff(page,fixture,account,true);
    expect((await page.request.get('/api/admin/withdrawals?page=1&pageSize=15')).status()).toBe(200);
    const id='00000000-0000-4000-8000-000000001000';
    const time=new Date(Date.now()-7*86400000).toISOString();
    const row={id,userId:'00000000-0000-4000-8000-000000001001',customerDisplayName:'Synthetic customer',amountSen:1000,status:'overdue',requiresDualApproval:false,approvalCycle:1,approvalCount:0,riskLevel:'low',riskOverridden:false,createdAt:time,updatedAt:time};
    await page.route('**/api/admin/withdrawals?*',route=>route.fulfill({json:{data:{items:[row],total:1,totalPages:1}}}));
    await page.route(`**/api/admin/withdrawals/${id}`,route=>route.fulfill({json:{data:{...row,customer:{displayName:'Synthetic customer',email:'synthetic@example.invalid',kycStatus:'approved',kycApprovedAt:time},wallet:{topupSen:0,earningsSen:1000,pendingEarningsSen:0,reservedSen:1000,withdrawnSen:0},destinationLabel:'Synthetic test destination',customerReason:null,approvals:[{actorId:account.id,actorLabel:'Synthetic Super Admin',action:'overdue',approvalCycle:1,note:'Synthetic escalation history; no funds moved',createdAt:time}],riskSnapshot:{},reviewSources:{rewardSources:[],affiliateSources:[],walletTransactions:[],fraudFlags:[]},reviewSourcesStatus:'ready',payoutFailure:{provider:null,eventId:null,code:null,message:null,category:null,occurredAt:null,retryable:null},payoutExecution:{locked:false,claimedAt:null},settlementProof:null,availableActions:[]}}}));
    await page.request.post('/api/locale',{data:{locale:'en'}});
    await page.goto('/admin/withdrawals');
    await expect(page.getByText('Synthetic customer',{exact:true})).toBeVisible();
    mkdirSync(output,{recursive:true});
    await page.screenshot({path:join(output,'admin-overdue-queue-desktop.png'),fullPage:true});
    await page.goto(`/admin/withdrawals/${id}`);
    await expect(page.getByText('Synthetic escalation history; no funds moved',{exact:false})).toBeVisible();
    await page.screenshot({path:join(output,'admin-overdue-history-desktop.png'),fullPage:true});
    await page.setViewportSize({width:390,height:844});
    await page.screenshot({path:join(output,'admin-overdue-history-mobile.png'),fullPage:true});
    writeFileSync(join(output,'admin-acceptance.json'),JSON.stringify({authentication:auth.evidence,queueAndHistory:'browser-mocked synthetic records',financialWrites:0,permissionProbe:'real authorized API returned 200',audit:'requeue audit independently asserted in isolated PostgreSQL replay'},null,2));
    await auth.removeVirtualDevice();
  } finally {await fixture.cleanup();}
});
