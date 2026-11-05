import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  isSuperAdmin: vi.fn(),
  rpc: vi.fn(),
  maybeSingle: vi.fn(),
}));

vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn(async () => ({
  auth: { getUser: mocks.getUser },
  rpc: mocks.rpc,
})) }));
vi.mock('@/lib/supabase/service', () => ({ createServiceClient: vi.fn(() => ({
  from: () => ({
    select: () => ({ eq: () => ({ maybeSingle: mocks.maybeSingle }) }),
  }),
})) }));
vi.mock('@/lib/affiliate/admin-guard', () => ({ isSuperAdmin: mocks.isSuperAdmin }));

import { PATCH } from '../route';

describe('PATCH /api/admin/tickets/[id]', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getUser.mockResolvedValue({ data: { user: { id: 'admin-1' } } });
    mocks.isSuperAdmin.mockResolvedValue(true);
    mocks.maybeSingle.mockResolvedValue({ data: { updated_at: '2026-11-05T10:00:00Z' }, error: null });
    mocks.rpc.mockResolvedValue({ data: { id: '11111111-1111-4111-8111-111111111111', status: 'resolved', category: 'booking', changed: true }, error: null });
  });

  it('uses the atomic versioned database transition for ticket resolution', async () => {
    const response = await PATCH(new Request('http://localhost/api/admin/tickets/11111111-1111-4111-8111-111111111111', {
      method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ status: 'resolved' }),
    }), { params: Promise.resolve({ id: '11111111-1111-4111-8111-111111111111' }) });

    expect(response.status).toBe(200);
    expect(mocks.rpc).toHaveBeenCalledWith('admin_update_support_ticket', {
      p_ticket_id: '11111111-1111-4111-8111-111111111111',
      p_expected_updated_at: '2026-11-05T10:00:00Z',
      p_status: 'resolved',
      p_category: null,
    });
  });

  it('returns a conflict when another update wins the version race', async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { message: 'support_ticket_stale' } });
    const response = await PATCH(new Request('http://localhost/api/admin/tickets/11111111-1111-4111-8111-111111111111', {
      method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ status: 'resolved' }),
    }), { params: Promise.resolve({ id: '11111111-1111-4111-8111-111111111111' }) });

    expect(response.status).toBe(409);
    expect(mocks.rpc).toHaveBeenCalledTimes(1);
  });
});
