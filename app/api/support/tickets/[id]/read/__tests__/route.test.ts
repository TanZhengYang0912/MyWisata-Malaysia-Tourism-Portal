import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ getUser: vi.fn(), from: vi.fn(), update: vi.fn(), or: vi.fn() }));

function query(result: unknown) {
  const terminal = Promise.resolve(result);
  const builder: Record<string, ReturnType<typeof vi.fn>> = {};
  for (const method of ['select', 'eq']) builder[method] = vi.fn(() => builder);
  builder.update = mocks.update.mockImplementation(() => builder);
  builder.or = mocks.or.mockImplementation(() => builder);
  builder.maybeSingle = vi.fn(() => terminal);
  builder.then = terminal.then.bind(terminal) as ReturnType<typeof vi.fn>;
  return builder;
}

vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn(async () => ({ auth: { getUser: mocks.getUser } })) }));
vi.mock('@/lib/supabase/service', () => ({ createServiceClient: () => ({ from: mocks.from }) }));
vi.mock('@/lib/affiliate/admin-guard', () => ({ isSuperAdmin: vi.fn(async () => false) }));

import { PATCH } from '../route';

const ticketId = 'da16e378-a33a-4e68-b56a-e2116d26ef26';
const replyId = 'e84c24b8-8474-4cc2-99bd-81fd2a827ddc';
const replyTime = '2026-11-11T10:00:00.000Z';

function request(body: unknown) {
  return new Request('http://localhost/api/support/tickets/ticket/read', {
    method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
  });
}

describe('PATCH /api/support/tickets/[id]/read', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getUser.mockResolvedValue({ data: { user: { id: 'owner-1' } } });
  });

  it('advances the read marker only to a verified incoming reply timestamp', async () => {
    const ticketQuery = query({ data: { id: ticketId, user_id: 'owner-1' }, error: null });
    const replyQuery = query({ data: { id: replyId, created_at: replyTime, sender_role: 'admin' }, error: null });
    const updateQuery = query({ data: { id: ticketId }, error: null });
    mocks.from.mockReturnValueOnce(ticketQuery).mockReturnValueOnce(replyQuery).mockReturnValueOnce(updateQuery);

    const response = await PATCH(request({ lastDisplayedReplyId: replyId }), { params: Promise.resolve({ id: ticketId }) });

    expect(response.status).toBe(200);
    expect(mocks.update).toHaveBeenCalledWith({ customer_last_read_at: replyTime });
    expect(mocks.or).toHaveBeenCalledWith(`customer_last_read_at.is.null,customer_last_read_at.lt.${replyTime}`);
  });

  it('rejects a reply that is not from the other participant', async () => {
    mocks.from.mockReturnValueOnce(query({ data: { id: ticketId, user_id: 'owner-1' }, error: null }))
      .mockReturnValueOnce(query({ data: { id: replyId, created_at: replyTime, sender_role: 'customer' }, error: null }));

    const response = await PATCH(request({ lastDisplayedReplyId: replyId }), { params: Promise.resolve({ id: ticketId }) });

    expect(response.status).toBe(422);
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it('returns a stable retryable error when the read marker update fails', async () => {
    mocks.from.mockReturnValueOnce(query({ data: { id: ticketId, user_id: 'owner-1' }, error: null }))
      .mockReturnValueOnce(query({ data: { id: replyId, created_at: replyTime, sender_role: 'admin' }, error: null }))
      .mockReturnValueOnce(query({ data: null, error: { code: 'XX000', message: 'internal-db-password=hidden' } }));

    const response = await PATCH(request({ lastDisplayedReplyId: replyId }), { params: Promise.resolve({ id: ticketId }) });
    const payload = await response.json();

    expect(response.status).toBe(503);
    expect(payload.error.code).toBe('READ_UNAVAILABLE');
    expect(payload.error.message).toBe('Unable to update the ticket read status.');
    expect(JSON.stringify(payload)).not.toContain('internal-db-password');
  });
});
