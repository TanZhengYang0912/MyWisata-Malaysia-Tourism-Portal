import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks=vi.hoisted(()=>({rpc:vi.fn(),from:vi.fn(),smtp:vi.fn()}));
vi.mock('@/lib/supabase/service',()=>({createServiceClient:()=>({rpc:mocks.rpc,from:mocks.from})}));
vi.mock('@/lib/platform/operations-settings',()=>({isPlatformOperationEnabled:async()=>false,PLATFORM_OPERATION_KEYS:{pauseCustomDelivery:'pause'}}));
vi.mock('@/lib/email/sender',()=>({sendAccountEmail:mocks.smtp,sendRecommendationEmail:vi.fn(),sendTransactionEmail:vi.fn(),sendVendorEmail:vi.fn(),sendKycSecurityEmail:vi.fn()}));
vi.mock('@/lib/email/order-receipt',()=>({sendOrderReceiptEmail:vi.fn()}));
vi.mock('@/lib/checkout/order-pickup-passes',()=>({loadOrderPickupPasses:vi.fn()}));
import { processWithdrawalApproverNotifications } from '../approver-notifications';
import { processEmailOutbox } from '@/lib/email/outbox';
const id=(n:number)=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
type Mail={id:string;event_key:string;status:string;payload:Record<string,unknown>;lease_token:string;attempts:number};
let mail:Mail[]=[];
beforeEach(()=>{
 vi.clearAllMocks();mail=[];
 mocks.from.mockImplementation((table:string)=>{
  if(table!=='email_outbox')throw new Error('Unexpected test table');
  return {upsert:(input:Mail)=>({select:()=>({maybeSingle:async()=>{
   if(mail.some(row=>row.event_key===input.event_key))return {data:null,error:null};
   const row={...input,id:id(10),lease_token:id(11),attempts:1};mail.push(row);return {data:{id:row.id},error:null};
  }})})};
 });
 mocks.rpc.mockImplementation((name:string,args?:Record<string,unknown>)=>{
  let data:unknown=true;
  if(name==='claim_withdrawal_approver_job')data={withdrawalId:id(1),cycle:1,stage:'overdue',cursor:null,token:id(2),customerUserId:id(3)};
  if(name==='deliver_withdrawal_approver_notifications')data={stale:false,recipients:[{id:id(4),email:'synthetic-admin@example.invalid',full_name:'Synthetic Admin',preferred_locale:'zh-CN'}]};
  if(name==='claim_email_outbox_delivery_v2')data={rows:mail.filter(row=>row.status==='pending'),reviewRequired:0};
  if(name==='finish_email_outbox_delivery')mail.find(row=>row.id===args?.p_id)!.status=String(args?.p_outcome);
  const result={data,error:null};return Object.assign(Promise.resolve(result),{abortSignal:async()=>result});
 });
 mocks.smtp.mockImplementation(async(input:{delivery:{beforeSend:()=>Promise<void>}})=>{await input.delivery.beforeSend();return {id:'captured-smtp-message'};});
});
describe('overdue intent through the durable mail worker',()=>{
 it('replays the same intent safely and hands a single message to a captured mail transport',async()=>{
  await processWithdrawalApproverNotifications();await processWithdrawalApproverNotifications();
  expect(mail).toHaveLength(1);
  expect(mail[0].event_key).toBe(`withdrawal_overdue:${id(1)}:cycle:1:approver:${id(4)}`);
  expect(await processEmailOutbox()).toEqual({sent:1,failed:0,reviewRequired:0});
  expect(mocks.smtp).toHaveBeenCalledWith(expect.objectContaining({eventType:'staff_withdrawal_approval',locale:'zh-CN',to:'synthetic-admin@example.invalid',reason:expect.stringContaining('Super Admin')}));
  expect(mail[0].status).toBe('sent');
  expect(await processEmailOutbox()).toEqual({sent:0,failed:0,reviewRequired:0});
  expect(mocks.smtp).toHaveBeenCalledTimes(1);
 });
});
