import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(), rpc: vi.fn(), from: vi.fn(),
  moderateWalletAction: vi.fn(), serviceFrom: vi.fn(),
}));

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({ auth: { getUser: mocks.getUser }, rpc: mocks.rpc, from: mocks.from })),
}));
vi.mock('@/lib/supabase/service', () => ({
  createServiceClient: vi.fn(() => ({ from: mocks.serviceFrom })),
}));
vi.mock('@/lib/wallet/moderation-guard', () => ({ moderateWalletAction: mocks.moderateWalletAction }));

import { GET, PATCH } from '../route';

const actor = '11111111-1111-4111-8111-111111111111';
function request(body: Record<string, unknown>) {
  return new Request('http://localhost/api/admin/wallet-settings', {
    method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
  });
}

describe('/api/admin/wallet-settings', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getUser.mockResolvedValue({ data: { user: { id: actor } }, error: null });
    mocks.rpc.mockResolvedValue({ data: true, error: null });
    mocks.moderateWalletAction.mockResolvedValue({ ok: true, categories: [] });
    mocks.from.mockReturnValue({ select: vi.fn().mockReturnThis(), in: vi.fn().mockResolvedValue({ data: [], error: null }) });
    mocks.serviceFrom.mockReturnValue({ upsert: vi.fn().mockResolvedValue({ error: null }), insert: vi.fn().mockResolvedValue({ error: null }) });
  });

  it('rejects non-super-admin callers', async () => {
    mocks.rpc.mockResolvedValue({ data: false, error: null });
    expect((await GET()).status).toBe(403);
  });

  it('rejects out-of-range settings before moderation or writes', async () => {
    const response = await PATCH(request({ clearanceDays: 0, reason: 'This is a valid reason.' }));
    expect(response.status).toBe(422);
    expect(mocks.moderateWalletAction).not.toHaveBeenCalled();
    expect(mocks.serviceFrom).not.toHaveBeenCalled();
  });

  it('rejects a settings reason that moderation flags', async () => {
    mocks.moderateWalletAction.mockResolvedValue({ ok: false, code: 'CONTENT_REJECTED', message: 'Reason rejected by Wallet policy' });
    const response = await PATCH(request({ escalationHours: 72, reason: 'A disallowed settings reason.' }));
    expect(response.status).toBe(422);
    expect(mocks.serviceFrom).not.toHaveBeenCalled();
  });

  it('requires a moderated reason and persists a valid setting change with audit and notification', async () => {
    const response = await PATCH(request({ escalationHours: 72, reason: 'Updated after reviewing payout queue.' }));
    expect(response.status).toBe(200);
    expect(mocks.moderateWalletAction).toHaveBeenCalled();
    expect(mocks.serviceFrom).toHaveBeenCalledWith('platform_settings');
    expect(mocks.serviceFrom).toHaveBeenCalledWith('audit_logs');
    expect(mocks.serviceFrom).toHaveBeenCalledWith('notifications');
  });
});
