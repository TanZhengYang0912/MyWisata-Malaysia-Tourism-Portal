import type {SupabaseClient} from '@supabase/supabase-js';
import {describe,expect,it,vi} from 'vitest';
vi.mock('next/headers',()=>({cookies:vi.fn()}));
import {addTripItem,clearTripItems,createTrip,deleteTrip,deleteTripItem,reorderTripItems,replaceTripItem,updateTripItem,updateTripItemLocation,writeTrip} from '../trips';

// Schedule/ownership/atomicity assertions execute the real migration in
// scripts/lib/trip-mutations-db.test.mjs; these cover the application boundary.
describe('Trip transaction boundary',()=>{
  it('passes opaque microsecond versions, parent identity and only intended fields',async()=>{
    const rpc=vi.fn(async()=>({data:{value:{id:'stop'},version:'2026-10-25T00:00:00.000002+00:00'},error:null}));
    const db={rpc} as unknown as SupabaseClient;
    const version='2026-10-25T00:00:00.000001+00:00';
    const result=await updateTripItem('stop',{scheduled_date:'2026-10-25',scheduled_time:'10:00'},db,'trip',version);
    expect(result.version).toBe('2026-10-25T00:00:00.000002+00:00');
    expect(rpc).toHaveBeenLastCalledWith('mutate_customer_trip',{p_trip_id:'trip',p_expected_version:version,p_operation:'schedule',p_input:{item_id:'stop',scheduled_date:'2026-10-25',scheduled_time:'10:00'}});
    await reorderTripItems('trip',['b','a'],db,version);
    expect(rpc).toHaveBeenLastCalledWith('mutate_customer_trip',expect.objectContaining({p_operation:'reorder',p_input:{ids:['b','a']}}));
  });
  it('routes every formal write through the same transaction',async()=>{
    const rpc=vi.fn(async()=>({data:{value:null,version:'v2'},error:null}));
    const db={rpc} as unknown as SupabaseClient;
    await createTrip({name:'Saved'},db);
    await addTripItem({trip_id:'trip',source:'location',lat:3,lng:101,label:'Origin'},db,'v');
    await updateTripItemLocation('stop',{label:'Origin',lat:3,lng:101},db,'trip','v');
    await replaceTripItem('stop',{experience_id:'product'},db,'trip','v');
    await deleteTripItem('stop',db,'trip','v');await clearTripItems('trip',db,'v');await deleteTrip('trip',db,'v');
    expect(rpc.mock.calls.map(call=>(call as unknown as [string,{p_operation:string}])[1].p_operation)).toEqual(['create','add','location','replace','remove','clear','delete']);
  });
  it('classifies stale writes safely without leaking database details',async()=>{
    const db={rpc:async()=>({data:null,error:{message:'trip_changed private values'}})} as unknown as SupabaseClient;
    await expect(writeTrip(db,'trip','v','clear')).rejects.toMatchObject({code:'TRIP_CHANGED',message:'Trip mutation rejected'});
  });
});

describe('legacy Trip recovery is explicit',()=>{
  it('reads only the current account legacy candidates and never writes during reads',async()=>{
    const {legacyCustomerTrips}=await import('../trips');
    const headers=await import('next/headers');
    vi.mocked(headers.cookies).mockResolvedValue({get:(name:string)=>({value:JSON.stringify(name==='MOCK_TRIPS' ? [{id:'old',user_id:'owner',name:'Saved'},{id:'other',user_id:'someone-else',name:'Foreign'},{id:'mock-trip-seed',user_id:'owner',name:'Sample'}] : [])})} as never);
    expect((await legacyCustomerTrips('owner')).map(row=>row.legacyId)).toEqual(['old']);
  });
});

// Safe failure categories must never expose the server's raw diagnostic text.
describe('Trip failure recovery categories',()=>{
  it.each([
    ['trip_invalid','P0001','TRIP_INVALID'],
    ['trip_schedule_unavailable','P0001','TRIP_NOT_AVAILABLE'],
    ['authentication_required','P0001','TRIP_ACCESS_DENIED'],
    ['private database diagnostic','XX000','TRIP_UNAVAILABLE'],
    ['transport response lost','','TRIP_RESULT_UNKNOWN'],
  ])('classifies %s safely',async(message,code,expected)=>{
    const db={rpc:vi.fn(async()=>({data:null,error:{message,code}}))} as unknown as SupabaseClient;
    await expect(writeTrip(db,'trip','version','schedule')).rejects.toMatchObject({code:expected,message:'Trip mutation rejected'});
  });
});
