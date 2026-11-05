import { describe, expect, it, vi } from 'vitest';
vi.mock('@/backend/supabase',()=>({supabase:{}}));
import { mapWithConcurrencyTwo } from '../catalogue';
describe('bounded catalogue and voucher requests',()=>{
  it('keeps at most two requests in flight and preserves candidate order',async()=>{
    let inFlight=0,max=0;
    const values=Array.from({length:50},(_,i)=>i);
    const result=await mapWithConcurrencyTwo(values,async value=>{
      inFlight++;max=Math.max(max,inFlight);
      await new Promise(resolve=>setTimeout(resolve,1));inFlight--;return value*2;
    });
    expect(max).toBe(2);expect(result).toEqual(values.map(value=>value*2));
  });
  it('stops starting stale candidates after cancellation',async()=>{
    const controller=new AbortController();const started:number[]=[];const finish:(()=>void)[]=[];
    const result=mapWithConcurrencyTwo([1,2,3,4,5],async value=>{
      started.push(value);await new Promise<void>(resolve=>finish.push(resolve));return value;
    },controller.signal);
    expect(started).toEqual([1,2]);controller.abort();finish.forEach(resolve=>resolve());
    await expect(result).rejects.toMatchObject({name:'AbortError'});expect(started).toEqual([1,2]);
  });
});
