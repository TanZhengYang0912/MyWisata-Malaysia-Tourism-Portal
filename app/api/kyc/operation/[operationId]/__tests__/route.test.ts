import { beforeEach, describe, expect, it, vi } from 'vitest';

const getUser=vi.fn();
const rpc=vi.fn();
vi.mock('@/lib/supabase/server',()=>({createClient:async()=>({auth:{getUser},rpc})}));

const {GET}=await import('../route');
const operationId='11111111-1111-4111-8111-111111111111';

describe('GET /api/kyc/operation/[operationId]',()=>{
  beforeEach(()=>{getUser.mockReset().mockResolvedValue({data:{user:{id:'owner'}}});rpc.mockReset();});

  it('returns owner-safe draft OCR state without OCR facts or paths',async()=>{
    rpc.mockResolvedValue({data:{operationId,state:'succeeded',submissionId:null,submissionStatus:null,
      safeErrorCode:null,updatedAt:'2026-11-09T00:00:00Z',holderName:'PRIVATE NAME',storagePath:'private/path'},error:null});
    const response=await GET(new Request('https://example.test'),{params:Promise.resolve({operationId})});
    const body=await response.json();
    expect(response.status).toBe(200);
    expect(body.data.operation).toMatchObject({id:operationId,state:'succeeded',submissionId:null});
    expect(JSON.stringify(body)).not.toContain('PRIVATE NAME');
    expect(JSON.stringify(body)).not.toContain('storagePath');
  });

  it('requires the authenticated owner and a valid operation id',async()=>{
    getUser.mockResolvedValueOnce({data:{user:null}});
    expect((await GET(new Request('https://example.test'),{params:Promise.resolve({operationId})})).status).toBe(401);
    expect((await GET(new Request('https://example.test'),{params:Promise.resolve({operationId:'invalid'})})).status).toBe(404);
    expect(rpc).not.toHaveBeenCalled();
  });
});
