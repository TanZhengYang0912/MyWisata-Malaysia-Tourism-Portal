import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const mocks=vi.hoisted(()=>({create:vi.fn(),run:vi.fn(),probe:vi.fn()}));
vi.mock('@/lib/supabase/service',()=>({createServiceClient:mocks.create}));
vi.mock('@/lib/kyc/prescreening',()=>({processKycPrescreening:mocks.run}));
vi.mock('@/lib/kyc/ocr-synthetic-probe',()=>({runKycSyntheticProbe:mocks.probe}));
vi.mock('@/lib/operations/queue-health', () => ({ recordPortalDispatch: vi.fn().mockResolvedValue(undefined), portalQueueHealth: vi.fn().mockResolvedValue({ kyc: { queued: 0 } }) }));
import { POST } from '../route';
beforeEach(()=>{ vi.stubEnv('CRON_SECRET','test-secret');mocks.create.mockReset().mockReturnValue({});mocks.run.mockReset().mockResolvedValue({enabled:false,claimed:0,writeErrors:0});mocks.probe.mockReset().mockResolvedValue({ok:true,fieldsRead:true}); });
afterEach(()=>vi.unstubAllEnvs());
describe('private KYC worker entry point',()=>{
 it.each([undefined,'Bearer wrong'])('rejects unauthorised request %s before service access',async(header)=>{
  const response=await POST(new Request('http://localhost',{method:'POST',headers:header?{authorization:header}:{}}));
  expect(response.status).toBe(401);expect(mocks.create).not.toHaveBeenCalled();expect(mocks.run).not.toHaveBeenCalled();
 });
 it('missing secret cannot authorise an empty bearer',async()=>{
  vi.stubEnv('CRON_SECRET','');const response=await POST(new Request('http://localhost',{method:'POST',headers:{authorization:'Bearer '}}));expect(response.status).toBe(401);
 });
 it('returns explicit disabled state and never any evidence',async()=>{
  const response=await POST(new Request('http://localhost',{method:'POST',headers:{authorization:'Bearer test-secret'}}));
  expect(response.status).toBe(200);expect(await response.json()).toMatchObject({enabled:false,claimed:0});
 });
 it('keeps failures generic and retriable',async()=>{
  mocks.run.mockRejectedValue(new Error('secret storage path'));
  const response=await POST(new Request('http://localhost',{method:'POST',headers:{authorization:'Bearer test-secret'}}));
  expect(response.status).toBe(503);expect(await response.text()).not.toContain('storage path');
 });
 it('returns a retriable status when finish writes fail',async()=>{
  mocks.run.mockResolvedValue({enabled:true,claimed:1,acknowledged:0,ocrProcessed:0,unavailable:0,notAcknowledged:0,writeErrors:1});
  const response=await POST(new Request('http://localhost',{method:'POST',headers:{authorization:'Bearer test-secret'}}));
  expect(response.status).toBe(503);
  expect(await response.json()).toMatchObject({writeErrors:1});
 });
});


it('rejects synthetic probe while formal processing is enabled, before DB access', async () => {
 vi.stubEnv('KYC_NODE_OCR_PROBE_ENABLED','true'); vi.stubEnv('KYC_PRESCREENING_ENABLED','true');
 const response=await POST(new Request('http://localhost',{method:'POST',headers:{authorization:'Bearer test-secret'},body:JSON.stringify({mode:'synthetic-check'})}));
 expect(response.status).toBe(403); expect(mocks.create).not.toHaveBeenCalled();
});
it('returns only safe OCR failure stage details from synthetic probe without touching business data', async () => {
 vi.stubEnv('KYC_NODE_OCR_PROBE_ENABLED','true'); vi.stubEnv('KYC_PRESCREENING_ENABLED','false');
 mocks.probe.mockResolvedValue({ok:false,failureCode:'service_unavailable',failureStage:'worker_initialize',failureReason:'module_not_found'});
 const response=await POST(new Request('http://localhost',{method:'POST',headers:{authorization:'Bearer test-secret'},body:JSON.stringify({mode:'synthetic-check'})}));
 expect(response.status).toBe(503);
 expect(await response.json()).toEqual({ok:false,failureCode:'service_unavailable',failureStage:'worker_initialize',failureReason:'module_not_found'});
 expect(mocks.create).not.toHaveBeenCalled(); expect(mocks.run).not.toHaveBeenCalled();
});
it('rejects unknown mode and excessive streamed JSON before service creation', async () => {
 for(const body of ['{"mode":"unknown"}', ' '.repeat(1025)]){
  const response=await POST(new Request('http://localhost',{method:'POST',headers:{authorization:'Bearer test-secret'},body}));
  expect([400,413]).toContain(response.status); expect(mocks.create).not.toHaveBeenCalled();
 }
});
