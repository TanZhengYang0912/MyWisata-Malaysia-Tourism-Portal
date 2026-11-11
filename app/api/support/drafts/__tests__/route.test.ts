import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ getUser: vi.fn(), createServiceClient: vi.fn(), clean: vi.fn(), rpc: vi.fn() }));
vi.mock('@/lib/supabase/server', () => ({ createClient: async () => ({ auth: { getUser: mocks.getUser } }) }));
vi.mock('@/lib/supabase/service', () => ({ createServiceClient: mocks.createServiceClient }));
vi.mock('@/lib/moderation/clean', () => ({ cleanUserContent: mocks.clean }));

import { DELETE, GET, PUT } from '../route';

function request(body: unknown) {
  return new Request('http://localhost/api/support/drafts', {
    method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
  });
}

describe('support draft APIs', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getUser.mockResolvedValue({ data: { user: { id: 'owner-1' } }, error: null });
    mocks.clean.mockImplementation(async (value: string) => ({ display: value.replace('012-3456789', '[PHONE]') }));
    mocks.rpc.mockResolvedValue({ data: { version: 2, changed: true }, error: null });
    const query: Record<string, (...args: unknown[]) => unknown> = {};
    query.select = () => query;
    query.eq = () => query;
    query.maybeSingle = async () => ({ data: { subject: 'Help', body: 'draft', version: 2 }, error: null });
    const deleteQuery: Record<string, (...args: unknown[]) => unknown> = {};
    deleteQuery.eq = () => deleteQuery;
    let deleteEqCount = 0;
    deleteQuery.eq = () => {
      deleteEqCount += 1;
      return deleteEqCount === 3 ? Promise.resolve({ error: null }) : deleteQuery;
    };
    mocks.createServiceClient.mockReturnValue({
      rpc: mocks.rpc,
      from: () => ({
        select: () => query,
        delete: () => deleteQuery,
      }),
    });
  });

  it('loads only the signed-in owner draft and disables caching', async () => {
    const response = await GET(new Request('http://localhost/api/support/drafts?surface=handoff&target=message-1'));
    const payload = await response.json();
    expect(response.status).toBe(200);
    expect(payload.data).toMatchObject({ subject: 'Help', body: 'draft', version: 2 });
    expect(response.headers.get('Cache-Control')).toContain('no-store');
  });

  it('server-cleans content and uses optimistic versioning on save', async () => {
    const response = await PUT(request({ surface: 'handoff', target: 'message-1', subject: 'Call 012-3456789', body: 'Help', expectedVersion: 1 }));
    expect(response.status).toBe(200);
    expect(mocks.rpc).toHaveBeenCalledWith('save_support_draft', expect.objectContaining({
      p_owner_id: 'owner-1', p_subject: 'Call [PHONE]', p_expected_version: 1,
    }));
  });

  it('rejects invalid draft scope before storage access', async () => {
    const response = await GET(new Request('http://localhost/api/support/drafts?surface=other&target=message-1'));
    expect(response.status).toBe(400);
  });

  it('clears only the authenticated account draft scope', async () => {
    const response = await DELETE(new Request('http://localhost/api/support/drafts?surface=handoff&target=message-1', { method: 'DELETE' }));
    expect(response.status).toBe(200);
  });
});
