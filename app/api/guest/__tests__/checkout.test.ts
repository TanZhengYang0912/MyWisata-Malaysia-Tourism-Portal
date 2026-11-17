import {beforeEach,describe,it,expect,vi} from 'vitest';
const mocks=vi.hoisted(()=>({getUser:vi.fn(),from:vi.fn(),rpc:vi.fn(),capability:vi.fn()}));
vi.mock('@/lib/supabase/server',()=>({createClient:async()=>({auth:{getUser:mocks.getUser},from:mocks.from,rpc:mocks.rpc})}));
vi.mock('@/lib/supabase/service',()=>({createServiceClient:()=>({from:mocks.from,rpc:mocks.rpc})}));
vi.mock('@/lib/entitlements/server',()=>({resolveEffectiveCapability:mocks.capability}));
vi.mock('@/lib/stripe',()=>({stripe:{checkout:{sessions:{create:vi.fn()}}}}));
vi.mock('next/server', async (importOriginal) => ({ ...await importOriginal<typeof import('next/server')>(), after: vi.fn() }));
vi.mock('next/headers', async (importOriginal) => ({ ...await importOriginal<typeof import('next/headers')>(), cookies: vi.fn(async () => ({ get: () => undefined })) }));
import {POST} from '@/app/api/customer/event-reservations/route';
const ID='1d4057cf-c821-4b05-a454-61dbdc42d32c';
function request(extra:Record<string,unknown>={}){return new Request('https://mylawatan.example/api/customer/event-reservations',{method:'POST',headers:{origin:'https://mylawatan.example',cookie:`__Host-mywisata-guest=${'A'.repeat(43)}`,'content-type':'application/json'},body:JSON.stringify({listingId:ID,pickupDate:'2026-10-03',slotId:ID,quantity:1,paymentMethod:'free_reservation',idempotencyKey:'guest-reservation-key-123456',contact:{email:'same.email+trip@gmail.com'},...extra})});}
beforeEach(()=>{
 vi.clearAllMocks();mocks.getUser.mockResolvedValue({data:{user:null},error:null});
 mocks.from.mockImplementation(()=>{const b:Record<string,unknown>={};for(const n of ['select','eq','is','gt'])b[n]=()=>b;b.maybeSingle=async()=>({data:{id:ID},error:null});return b;});
 mocks.rpc.mockImplementation(async(name:string)=>name==='reserve_guest_rate_limit'?{data:true,error:null}:{data:{checkout_session_id:ID,order_id:ID,status:'paid',total:0},error:null});
});
describe('guest reserve-now entry boundary',()=>{
 it('prepares with a separate subject and snapshots contact without creating Auth users',async()=>{
  const response=await POST(request());expect(response.status).toBe(200);
  expect(mocks.rpc).toHaveBeenCalledWith('guest_prepare_event_checkout',expect.objectContaining({p_guest_subject_id:ID,p_contact:{email:'same.email+trip@gmail.com',name:null,phone:null}}));expect(mocks.capability).not.toHaveBeenCalled();
 });
 it('does not snapshot the page language on the guest contact',async()=>{
  const req=request();req.headers.set('cookie',req.headers.get('cookie')+'; NEXT_LOCALE=zh-CN');
  expect((await POST(req)).status).toBe(200);
  const call=mocks.rpc.mock.calls.find(([name])=>name==='guest_prepare_event_checkout')!;
  expect(call[1].p_contact).not.toHaveProperty('locale');
 });
 it('requires valid contact without OTP or phone for a free guest reservation',async()=>{
  expect((await POST(request({contact:{email:'invalid'}}))).status).toBe(422);
  expect(mocks.rpc).not.toHaveBeenCalledWith('guest_prepare_event_checkout',expect.anything());
 });
 it.each(['wallet','wallet_split'])('rejects guest %s before an order is prepared',async(paymentMethod)=>{expect((await POST(request({paymentMethod}))).status).toBe(403);expect(mocks.rpc).not.toHaveBeenCalledWith('guest_prepare_event_checkout',expect.anything());});
 it('does not fall back to guest when a signed-in account fails Email verification',async()=>{
  mocks.getUser.mockResolvedValue({data:{user:{id:ID,email:'a@example.com'}},error:null});mocks.capability.mockResolvedValue({capability:'commerce.checkout',allowed:false,blockerCode:'EMAIL_VERIFICATION_REQUIRED',qualificationPaths:[],entitlementGeneration:1,source:'hard_guard'});
  expect((await POST(request())).status).toBe(403);expect(mocks.rpc).not.toHaveBeenCalled();
 });
 it('limits streamed guest checkout bodies before preparing an order',async()=>{const req=request({padding:'x'.repeat(33000)});expect((await POST(req)).status).toBe(413);expect(mocks.rpc).not.toHaveBeenCalledWith('guest_prepare_event_checkout',expect.anything());});
 it('rejects cross-origin guest checkout',async()=>{const req=request();const hostile=new Request(req,{headers:{cookie:req.headers.get('cookie')!,origin:'https://attacker.example'}});expect((await POST(hostile)).status).toBe(403);expect(mocks.rpc).not.toHaveBeenCalled();});
});
