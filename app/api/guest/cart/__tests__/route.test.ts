import {beforeEach,describe,it,expect,vi} from 'vitest';
const mocks=vi.hoisted(()=>({guest:vi.fn(),limit:vi.fn(),from:vi.fn(),insert:vi.fn(),update:vi.fn(),upsert:vi.fn()}));
vi.mock('@/lib/supabase/service',()=>({createServiceClient:()=>({from:mocks.from})}));
vi.mock('@/lib/checkout/guest-session',async importOriginal=>({...await importOriginal<typeof import('@/lib/checkout/guest-session')>(),resolveGuestSession:mocks.guest,reserveGuestRateLimit:mocks.limit}));
vi.mock('@/backend/supabase',()=>({supabase:{}}));
import {POST,GET,PATCH} from '../route';
const ID='1d4057cf-c821-4b05-a454-61dbdc42d32c';
const variant='2d4057cf-c821-4b05-a454-61dbdc42d32c';
function request(body:unknown,origin='https://mylawatan.example'){return new Request('https://mylawatan.example/api/guest/cart',{method:'POST',headers:{origin,'content-type':'application/json'},body:JSON.stringify(body)});}
let productCategory = 'food';
beforeEach(()=>{
 vi.clearAllMocks();mocks.guest.mockResolvedValue({guestSubjectId:ID});mocks.limit.mockResolvedValue(true);
 productCategory = 'food';
 mocks.from.mockImplementation((table:string)=>{
  const b:Record<string,unknown>={};for(const key of ['select','eq','is','gt'])b[key]=()=>b;
  b.upsert=mocks.upsert.mockResolvedValue({error:null});b.insert=mocks.insert.mockResolvedValue({error:null});b.update=mocks.update.mockReturnValue(b);
  b.maybeSingle=async()=>({data:table==='products'?{id:ID,outlet_id:ID,requires_booking:false,base_price:10,categories:{slug:productCategory}}:table==='product_variants'?{id:variant,price_offset:2}:{id:ID},error:null});
  b.order=async()=>({data:[],error:null});return b;
 });
});
describe('guest cart server boundary',()=>{
 it('rejects cross-origin mutation before touching owner data',async()=>{expect((await POST(request({},'https://attacker.example'))).status).toBe(403);expect(mocks.from).not.toHaveBeenCalled();});
 it('does not write for a missing or expired subject',async()=>{mocks.guest.mockResolvedValue(null);expect((await POST(request({}))).status).toBe(401);expect(mocks.from).not.toHaveBeenCalled();});
 it('rejects presented owner IDs instead of assigning the cart to them',async()=>{expect((await POST(request({item:{activityId:ID,variantId:variant,qty:1},guestSubjectId:ID}))).status).toBe(422);expect(mocks.insert).not.toHaveBeenCalled();});
 it('ignores supplied prices and persists the canonical product plus variant price',async()=>{
  expect((await POST(request({item:{activityId:ID,variantId:variant,qty:1,priceOverride:0.01}}))).status).toBe(200);
  expect(mocks.upsert).toHaveBeenCalledWith({guest_subject_id:ID},expect.objectContaining({onConflict:'guest_subject_id'}));
  expect(mocks.insert).toHaveBeenCalledWith(expect.objectContaining({cart_id:ID,unit_price:12}));
 });
 it('stores valid stay details on accommodation cart rows',async()=>{
  productCategory = 'accommodation';
  const stayDetails = {primaryGuestName:'Nur Aisyah',additionalGuestNames:['Sam Lee'],adults:2,estimatedArrival:'unknown',specialRequest:'Quiet room'};
  expect((await POST(request({item:{activityId:ID,variantId:variant,qty:1,stayDetails}}))).status).toBe(200);
  expect(mocks.insert).toHaveBeenCalledWith(expect.objectContaining({stay_details:stayDetails}));
 });
 it('fails closed when adding an accommodation line without a primary guest',async()=>{
  productCategory = 'accommodation';
  expect((await POST(request({item:{activityId:ID,variantId:variant,qty:1}}))).status).toBe(422);
  expect(mocks.insert).not.toHaveBeenCalled();
 });
 it('does not let a guest edit stay details for a cart row outside its resolved cart',async()=>{
  const response = await PATCH(new Request('https://mylawatan.example/api/guest/cart',{method:'PATCH',headers:{origin:'https://mylawatan.example','content-type':'application/json'},body:JSON.stringify({cartItemId:'3d4057cf-c821-4b05-a454-61dbdc42d32c',stayDetails:{primaryGuestName:'Nur Aisyah',adults:1,estimatedArrival:'unknown'}})}));
  expect(response.status).toBe(404);
  expect(mocks.update).not.toHaveBeenCalled();
 });
 it('returns an empty private response without creating a subject for anonymous reads',async()=>{mocks.guest.mockResolvedValue(null);const response=await GET(new Request('https://mylawatan.example/api/guest/cart'));expect(await response.json()).toEqual({data:{items:[]},error:null});expect(response.headers.get('cache-control')).toContain('no-store');expect(mocks.upsert).not.toHaveBeenCalled();});
});

describe('guest cart skips unchanged PATCH writes',()=>{
 const ROW='4d4057cf-c821-4b05-a454-61dbdc42d32c';
 const stay={primaryGuestName:'Nur Aisyah',adults:1,estimatedArrival:'unknown'};
 let orderCalls=0;
 function useRow(category:string,stay_details:unknown=null){
  orderCalls=0;
  mocks.from.mockImplementation((table:string)=>{
   const b:Record<string,unknown>={};for(const key of ['select','eq','is','gt'])b[key]=()=>b;
   b.update=mocks.update.mockReturnValue(b);b.delete=()=>b;
   b.maybeSingle=async()=>({data:table==='products'?{id:ID,categories:{slug:category}}:{id:ID},error:null});
   b.then=(resolve:(value:unknown)=>unknown)=>resolve({error:null});
   b.order=async()=>{orderCalls++;return {data:[{id:ROW,variant_id:variant,slot_id:null,outlet_id:ID,quantity:2,nights:1,unit_price:12,stay_details,product_variants:{product_id:ID},booking_slots:null}],error:null};};
   return b;
  });
 }
 function patch(body:unknown){return PATCH(new Request('https://mylawatan.example/api/guest/cart',{method:'PATCH',headers:{origin:'https://mylawatan.example','content-type':'application/json'},body:JSON.stringify(body)}));}
 const key=async()=>{const {cartItemKey}=await import('@/backend/core/helpers');const {mapCartItem}=await import('@/backend/domains/commerce');return cartItemKey(mapCartItem({id:ROW,variant_id:variant,slot_id:null,outlet_id:ID,quantity:2,nights:1,unit_price:12,stay_details:null,product_variants:{product_id:ID},booking_slots:null} as never));};

 it('does not write or re-read when the quantity is unchanged',async()=>{
  useRow('food');
  const response=await patch({key:await key(),quantity:2});
  expect(response.status).toBe(200);
  expect(mocks.update).not.toHaveBeenCalled();
  expect(orderCalls).toBe(1);
  expect((await response.json()).data.items).toHaveLength(1);
 });
 it('writes a changed quantity',async()=>{
  useRow('food');
  expect((await patch({key:await key(),quantity:3})).status).toBe(200);
  expect(mocks.update).toHaveBeenCalledWith({quantity:3});
 });
 it('does not write identical stay details, but writes changed ones',async()=>{
  useRow('accommodation',stay);
  expect((await patch({cartItemId:ROW,stayDetails:stay})).status).toBe(200);
  expect(mocks.update).not.toHaveBeenCalled();
  expect((await patch({cartItemId:ROW,stayDetails:{...stay,specialRequest:'Late check-in'}})).status).toBe(200);
  expect(mocks.update).toHaveBeenCalledWith({stay_details:{...stay,specialRequest:'Late check-in'}});
 });
});
