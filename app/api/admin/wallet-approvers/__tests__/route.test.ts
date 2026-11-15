import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ getUser: vi.fn(), rpc: vi.fn(), from: vi.fn(), serviceFrom: vi.fn(), serviceRpc: vi.fn(), moderateWalletAction: vi.fn() }));
vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn(async () => ({ auth: { getUser: mocks.getUser }, rpc: mocks.rpc, from: mocks.from })) }));
vi.mock('@/lib/supabase/service', () => ({ createServiceClient: vi.fn(() => ({ from: mocks.serviceFrom, rpc: mocks.serviceRpc })) }));
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
    mocks.serviceFrom.mockImplementation((table: string) => {
      const result = table === 'roles' ? { data: { id: 7 }, error: null } : { data: [], error: null };
      const terminal = Promise.resolve(result);
      const query: Record<string, ReturnType<typeof vi.fn>> = {};
      for (const method of ['select', 'eq', 'in', 'is', 'delete', 'insert', 'upsert']) query[method] = vi.fn(() => query);
      query.maybeSingle = vi.fn(async () => result);
      query.then = terminal.then.bind(terminal) as ReturnType<typeof vi.fn>;
      return query;
    });
    mocks.serviceRpc.mockResolvedValue({ data: { eligibleUsers: [{ id: target, email: 'candidate@example.com', name: 'Candidate' }], total: 1 }, error: null });
  });

  it('blocks non-super-admin role management', async () => {
    mocks.rpc.mockResolvedValue({ data: false, error: null });
    expect((await GET(new Request('http://localhost/api/admin/wallet-approvers'))).status).toBe(403);
  });

  it('uses a database-paged candidate query instead of a 100-user cap', async () => {
    const source = readFileSync(resolve(process.cwd(), 'app/api/admin/wallet-approvers/route.ts'), 'utf8');
    expect(source).toContain("rpc('list_wallet_approver_candidates'");
    expect(source).not.toContain('.limit(100)');
    const response = await GET(new Request('http://localhost/api/admin/wallet-approvers?page=2&pageSize=25&search=Candidate'));
    expect(response.status).toBe(200);
    expect(mocks.serviceRpc).toHaveBeenCalledWith('list_wallet_approver_candidates', { p_search: 'Candidate', p_page: 2, p_page_size: 25 });
    await expect(response.json()).resolves.toMatchObject({ data: { page: 2, pageSize: 25, total: 1 } });
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

  it('delegates a valid role change to one authenticated atomic RPC', async () => {
    mocks.rpc
      .mockResolvedValueOnce({ data: true, error: null })
      .mockResolvedValueOnce({
        data: { userId: target, approver: true, action: 'grant', changed: true },
        error: null,
      });

    const response = await PATCH(req({
      userId: target,
      action: 'grant',
      reasonCategory: 'other',
      reason: 'Grant for scheduled payout coverage.',
    }));

    expect(response.status).toBe(200);
    expect(mocks.rpc).toHaveBeenLastCalledWith('manage_wallet_approver', {
      p_target_user_id: target,
      p_action: 'grant',
      p_reason_category: 'other',
      p_note: 'Grant for scheduled payout coverage.',
    });
    expect(mocks.serviceFrom).not.toHaveBeenCalled();
  });

  it('maps an atomic last-approver conflict without performing a direct delete', async () => {
    mocks.rpc
      .mockResolvedValueOnce({ data: true, error: null })
      .mockResolvedValueOnce({ data: null, error: { message: 'last_approver' } });

    const response = await PATCH(req({
      userId: target,
      action: 'revoke',
      reasonCategory: 'other',
      reason: 'Revoke after the approver rotation ended.',
    }));

    expect(response.status).toBe(409);
    expect(mocks.serviceFrom).not.toHaveBeenCalled();
  });
});
