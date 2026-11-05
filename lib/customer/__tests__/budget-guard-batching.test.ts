import { mkdirSync, writeFileSync } from 'node:fs';
import { performance } from 'node:perf_hooks';
import { describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
vi.mock('@/backend/supabase', () => ({ supabase: {} }));
import { getComputedActivity } from '@/backend/domains/catalogue';
import { resolveBudgetItems } from '../budget-guard';

function database(size: number) {
  let reads = 0;
  const rows: Record<string, Record<string, unknown>[]> = {
    products: Array.from({length:size},(_,i)=>({id:`p${i}`,name:`Product ${i}`,vendor_id:'v',outlet_id:'o',base_price:i+10,product_type:'experience',requires_booking:true,status:'active',review_status:'approved',categories:{name:'Activity',slug:'activity'},outlet_offers:[],product_variants:[],price_rules:[]})),
    outlets: [{id:'o',vendor_id:'v',name:'Shop',city:'City',state:'Penang',lat:3,lng:101,status:'active',review_status:'approved',operating_hours:null,vendors:{name:'Vendor',slug:'vendor',status:'active'}}],
    product_review_metrics: Array.from({length:size},(_,i)=>({product_id:`p${i}`,rating:4.8,reviews:12})),
  };
  const db = { from: (table: string) => {
    let filtered = rows[table] ?? [];
    const query = {
      select: () => query,
      eq: (column:string,value:unknown) => {filtered=filtered.filter(row=>row[column]===value);return query;},
      in: (column:string,values:unknown[]) => {filtered=filtered.filter(row=>values.includes(row[column]));return query;},
      maybeSingle: async () => {reads++;return {data:filtered[0] ?? null,error:null};},
      then: (resolve:(value:unknown)=>unknown) => {reads++;return Promise.resolve({data:filtered,error:null}).then(resolve);},
    };return query;
  } } as unknown as SupabaseClient;
  return {db,reads:()=>reads};
}
describe('budget catalogue batch behavior',()=>{
  it('preserves single-loader prices and quantities with three batch reads for 1, 10 and 50 lines',async()=>{
    const measurements=[];
    for(const count of [1,10,50]) {
      const baseline=database(count),batched=database(count);
      const lines=Array.from({length:count},(_,i)=>({productId:`p${i}`,qty:i%3+1}));
      const expected=await Promise.all(lines.map(async line=>{
        const activity=await getComputedActivity(line.productId,undefined,baseline.db);
        return {productId:activity!.id,name:activity!.name,price:activity!.price,qty:line.qty,category:activity!.category,categorySlug:activity!.categorySlug,state:activity!.place?.state ?? activity!.outlet.state ?? null,productType:'experience'};
      }));
      const start=performance.now();const actual=await resolveBudgetItems(lines,batched.db);const durationMs=performance.now()-start;
      expect(actual).toEqual(expected);expect(batched.reads()).toBe(3);
      measurements.push({lines:count,baselineReads:baseline.reads()+1,batchReads:batched.reads(),fixtureDurationMs:durationMs});
    }
    mkdirSync('test-results/owned-flow-recovery',{recursive:true});
    writeFileSync('test-results/owned-flow-recovery/budget-query-counts.json',JSON.stringify({scope:'real catalogue mapping with synthetic query transport; timings are not database capacity',measurements},null,2));
  });
});
