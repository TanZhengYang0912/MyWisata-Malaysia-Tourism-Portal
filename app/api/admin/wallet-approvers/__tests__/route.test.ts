import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ getUser: vi.fn(), rpc: vi.fn(), from: vi.fn(), serviceFrom: vi.fn(), moderateWalletAction: vi.fn() }));
vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn(async () => ({ auth: { getUser: mocks.getUser }, rpc: mocks.rpc, from: mocks.from })) }));
vi.mock('@/lib/supabase/service', () => ({ createServiceClient: vi.fn(() => ({ from: mocks.serviceFrom })) }));
vi.mock('@/lib/wallet/moderation-guard', () => ({ moderateWalletAction: mocks.moderateWalletAction }));

import { GET, PATCH } from '../route';
const actor = '11111111-1111-4111-8111-111111111111';
const target = '22222222-2222-4222-8222-222222222222';
function req(body: Record<string, unknown>) { return new Request('http://localhost/api/admin/wallet-approvers', { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }); }

describe('/api/admin/wallet-approvers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getUser.mockResolvedValue({ data: { user: { id: actor } }, error: null });
    mocks.rpc.mockResolvedValue({ data: true, error: null });
    mocks.moderateWalletAction.mockResolvedValue({ ok: true, categories: [] });
    mocks.from.mockReturnValue({ select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), maybeSingle: vi.fn().mockResolvedValue({ data: { id: 7 }, error: null }) });
    mocks.serviceFrom.mockReturnValue({ select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), in: vi.fn().mockReturnThis(), maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }), insert: vi.fn().mockResolvedValue({ error: null }), delete: vi.fn().mockReturnThis(), is: vi.fn().mockReturnThis(), upsert: vi.fn().mockResolvedValue({ error: null }) });
  });

  it('blocks non-super-admin role management', async () => {
    mocks.rpc.mockResolvedValue({ data: false, error: null });
    expect((await GET()).status).toBe(403);
  });

  it('prevents self role changes', async () => {
    const response = await PATCH(req({ userId: actor, action: 'grant', reason: 'Keep my own role unchanged.' }));
    expect(response.status).toBe(403);
    expect(mocks.moderateWalletAction).not.toHaveBeenCalled();
  });

  it('requires a clean reason before granting an approver role', async () => {
    const response = await PATCH(req({ userId: target, action: 'grant', reason: 'short' }));
    expect(response.status).toBe(422);
    expect(mocks.serviceFrom).not.toHaveBeenCalled();
  });
});
