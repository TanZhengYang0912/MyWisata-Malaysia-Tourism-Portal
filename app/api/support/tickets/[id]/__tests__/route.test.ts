import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ getUser: vi.fn(), sessionFrom: vi.fn(), serviceFrom: vi.fn(), isSuperAdmin: vi.fn() }));
vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn(async () => ({ auth: { getUser: mocks.getUser }, from: mocks.sessionFrom })) }));
vi.mock('@/lib/supabase/service', () => ({ createServiceClient: () => ({ from: mocks.serviceFrom }) }));
vi.mock('@/lib/affiliate/admin-guard', () => ({ isSuperAdmin: mocks.isSuperAdmin }));

import { GET } from '../route';

const TICKET = { id: 't1', user_id: 'owner-1', session_id: null, withdrawal_id: null, subject: 'S', body: 'B', category: 'other', status: 'open', assigned_to: null, created_at: 'c', resolved_at: null, last_reply_at: null };

function chain(result: unknown) {
  const value = { select: vi.fn(), eq: vi.fn(), order: vi.fn(), maybeSingle: vi.fn().mockResolvedValue(result), then: vi.fn() };
  value.select.mockReturnValue(value);
  value.eq.mockReturnValue(value);
  value.order.mockReturnValue(value);
  value.then.mockImplementation((resolve: (v: unknown) => unknown) => Promise.resolve({ data: [], error: null }).then(resolve));
  return value;
}

const call = () => GET(new Request('http://x'), { params: Promise.resolve({ id: 't1' }) });

describe('GET /api/support/tickets/[id]', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.isSuperAdmin.mockResolvedValue(false);
    mocks.serviceFrom.mockReturnValue(chain({ data: TICKET, error: null }));
    mocks.sessionFrom.mockImplementation(() => chain({ data: null, error: null }));
  });

  // Signed-in users only hold column grants on a few support_tickets columns,
  // so the full row must come from the service client, never the session.
  it('reads the full ticket row through the service client for the owner', async () => {
    mocks.getUser.mockResolvedValue({ data: { user: { id: 'owner-1' } } });
    const res = await call();
    expect(res.status).toBe(200);
    expect(mocks.serviceFrom).toHaveBeenCalledWith('support_tickets');
    expect(mocks.sessionFrom).not.toHaveBeenCalledWith('support_tickets');
    // Reply text is not readable by signed-in users either; it is read after the ownership check.
    expect(mocks.serviceFrom).toHaveBeenCalledWith('support_ticket_replies');
    expect(mocks.sessionFrom).not.toHaveBeenCalledWith('support_ticket_replies');
    expect((await res.json()).data.body).toBe('B');
  });

  it("refuses another customer's ticket", async () => {
    mocks.getUser.mockResolvedValue({ data: { user: { id: 'someone-else' } } });
    expect((await call()).status).toBe(403);
    expect(mocks.serviceFrom).not.toHaveBeenCalledWith('support_ticket_replies');
  });
});
