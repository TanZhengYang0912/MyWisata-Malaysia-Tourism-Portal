import { beforeEach, describe, expect, it, vi } from 'vitest';

const rpc=vi.fn();
const remove=vi.fn();
const inPaths=vi.fn();
const createServiceClient=vi.fn();
vi.mock('@/lib/supabase/service',()=>({createServiceClient}));

const {POST}=await import('../route');
const stagingPath='11111111-1111-4111-8111-111111111111/drafts/22222222-2222-4222-8222-222222222222/staging/33333333-3333-4333-8333-333333333333/front.jpg';
const request=()=>new Request('https://example.test/api/cron/purge-kyc-drafts',{method:'POST',headers:{authorization:'Bearer cron-secret'}});

describe('POST /api/cron/purge-kyc-drafts',()=>{
  beforeEach(()=>{
    vi.stubEnv('CRON_SECRET','cron-secret'); vi.stubEnv('KYC_DRAFT_PURGE_BATCH_SIZE','20'); vi.stubEnv('KYC_DRAFT_PURGE_LEASE_SECONDS','300');
    rpc.mockReset(); remove.mockReset().mockResolvedValue({error:null}); inPaths.mockReset().mockResolvedValue({data:[],error:null});
    createServiceClient.mockReturnValue({rpc,from:()=>({select:()=>({in:inPaths,eq:()=>({limit:inPaths})})}),storage:{from:()=>({remove})}});
  });

  it('removes failed operation staging objects through the existing bounded orphan queue',async()=>{
    rpc.mockImplementation((name:string)=>Promise.resolve(name==='claim_kyc_draft_cleanup_orphans'
      ?{data:[{orphan_id:'44444444-4444-4444-8444-444444444444',storage_path:stagingPath}],error:null}
      :name==='is_kyc_draft_storage_path_referenced'?{data:false,error:null}
      :name==='finish_kyc_draft_cleanup_orphan'?{data:true,error:null}:{data:[],error:null}));
    const response=await POST(request());
    expect(response.status).toBe(200);
    expect(remove).toHaveBeenCalledWith([stagingPath]);
    expect(rpc).toHaveBeenCalledWith('finish_kyc_draft_cleanup_orphan',{p_orphan_id:'44444444-4444-4444-8444-444444444444',p_succeeded:true});
    expect(JSON.stringify(await response.json())).not.toContain(stagingPath);
  });

  it('does not delete a staging path still referenced by formal evidence',async()=>{
    rpc.mockImplementation((name:string)=>Promise.resolve(name==='claim_kyc_draft_cleanup_orphans'
      ?{data:[{orphan_id:'44444444-4444-4444-8444-444444444444',storage_path:stagingPath}],error:null}
      :name==='is_kyc_draft_storage_path_referenced'?{data:false,error:null}
      :name==='claim_kyc_draft_purge'?{data:[],error:null}:{data:true,error:null}));
    inPaths.mockResolvedValue({data:[{storage_path:stagingPath}],error:null});
    const response=await POST(request());
    expect(response.status).toBe(200);
    expect(remove).not.toHaveBeenCalled();
  });

  it('retains and reschedules a staging path still referenced by the editing draft',async()=>{
    rpc.mockImplementation((name:string)=>Promise.resolve(name==='claim_kyc_draft_cleanup_orphans'
      ?{data:[{orphan_id:'44444444-4444-4444-8444-444444444444',storage_path:stagingPath}],error:null}
      :name==='is_kyc_draft_storage_path_referenced'?{data:true,error:null}
      :name==='claim_kyc_draft_purge'?{data:[],error:null}:{data:true,error:null}));
    const response=await POST(request());
    expect(response.status).toBe(200);
    expect(remove).not.toHaveBeenCalled();
    expect(rpc).toHaveBeenCalledWith('finish_kyc_draft_cleanup_orphan',{
      p_orphan_id:'44444444-4444-4444-8444-444444444444',p_succeeded:false,
    });
  });

  it('retains and reschedules a path retired by editing-draft replacement',async()=>{
    rpc.mockImplementation((name:string)=>Promise.resolve(name==='claim_kyc_draft_cleanup_orphans'
      ?{data:[{orphan_id:'44444444-4444-4444-8444-444444444444',storage_path:stagingPath}],error:null}
      :name==='is_kyc_draft_storage_path_referenced'?{data:true,error:null}
      :name==='claim_kyc_draft_purge'?{data:[],error:null}:{data:true,error:null}));
    const response=await POST(request());
    expect(response.status).toBe(200);
    expect(remove).not.toHaveBeenCalled();
    expect(rpc).toHaveBeenCalledWith('finish_kyc_draft_cleanup_orphan',{
      p_orphan_id:'44444444-4444-4444-8444-444444444444',p_succeeded:false,
    });
  });

  it('does not delete or discard an orphan when the draft-reference check fails',async()=>{
    rpc.mockImplementation((name:string)=>Promise.resolve(name==='claim_kyc_draft_cleanup_orphans'
      ?{data:[{orphan_id:'44444444-4444-4444-8444-444444444444',storage_path:stagingPath}],error:null}
      :name==='is_kyc_draft_storage_path_referenced'?{data:null,error:{message:'unavailable'}}
      :name==='claim_kyc_draft_purge'?{data:[],error:null}:{data:true,error:null}));
    const response=await POST(request());
    expect(response.status).toBe(200);
    expect(remove).not.toHaveBeenCalled();
    expect(rpc).toHaveBeenCalledWith('finish_kyc_draft_cleanup_orphan',{
      p_orphan_id:'44444444-4444-4444-8444-444444444444',p_succeeded:false,
    });
  });
});
