import { beforeEach, describe, expect, it, vi } from 'vitest';

const getUser = vi.fn();
const isSuperAdmin = vi.fn();
const createServiceClient = vi.fn();
const commitSupportTicketReply = vi.fn();
const logModerationFlag = vi.fn();
const logAdminConductFlagIfNeeded = vi.fn();

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({ auth: { getUser } }),
}));
vi.mock('@/lib/supabase/service', () => ({ createServiceClient }));
vi.mock('@/lib/affiliate/admin-guard', () => ({ isSuperAdmin }));
vi.mock('@/lib/moderation/flags', () => ({ logModerationFlag }));
vi.mock('@/lib/moderation/admin-conduct', () => ({ logAdminConductFlagIfNeeded }));

const { GET, POST } = await import('../route');

const TICKET_ID = '11111111-1111-4111-8111-111111111111';
const TICKET_OWNER_ID = 'customer-1';
const OPERATION_ID = '7b456ed4-615e-4210-a704-840abc4c1790';
const CREATED_AT = '2026-08-09T00:00:00.000Z';
const REPLY_ID = '33333333-3333-4333-8333-333333333333';

function request(body: string) {
  return new Request(`http://localhost/api/support/tickets/${TICKET_ID}/replies`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ body, operationId: OPERATION_ID }),
  });
}

function callRoute(body: string) {
  return POST(request(body), { params: Promise.resolve({ id: TICKET_ID }) });
}

function replyResult(overrides: Record<string, unknown> = {}) {
  return {
    id: 'reply-1',
    sender_id: 'caller-1',
    sender_role: 'admin',
    body: 'masked body',
    created_at: CREATED_AT,
    new_status: 'in_progress',
    created: true,
    ticket_user_id: TICKET_OWNER_ID,
    ...overrides,
  };
}

function mockClient() {
  createServiceClient.mockReturnValue({
    rpc: commitSupportTicketReply,
    from: (table: string) => {
      if (table === 'moderation_custom_words') {
        return { select: () => ({ eq: () => Promise.resolve({ data: [] }) }) };
      }
      throw new Error(`Unexpected database read: ${table}`);
    },
  });
}

describe('POST /api/support/tickets/[id]/replies', () => {
  beforeEach(() => {
    getUser.mockReset();
    isSuperAdmin.mockReset();
    createServiceClient.mockReset();
    commitSupportTicketReply.mockReset().mockResolvedValue({ data: replyResult(), error: null });
    logModerationFlag.mockReset().mockResolvedValue(undefined);
    logAdminConductFlagIfNeeded.mockReset().mockResolvedValue(undefined);
    getUser.mockResolvedValue({ data: { user: { id: 'caller-1' } } });
    mockClient();
  });

  it('flags a newly committed admin reply and passes the ticket owner', async () => {
    isSuperAdmin.mockResolvedValue(true);

    const response = await callRoute('this fucking service is broken');

    expect(response.status).toBe(201);
    expect(logAdminConductFlagIfNeeded).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      flaggedAdminId: 'caller-1',
      targetUserId: TICKET_OWNER_ID,
      source: 'ticket_reply',
      sourceRefId: TICKET_ID,
      cleaned: expect.objectContaining({ hadProfanity: true }),
    }));
  });

  it('does not run admin conduct review for a customer reply', async () => {
    isSuperAdmin.mockResolvedValue(false);
    getUser.mockResolvedValue({ data: { user: { id: TICKET_OWNER_ID } } });
    commitSupportTicketReply.mockResolvedValue({
      data: replyResult({ sender_id: TICKET_OWNER_ID, sender_role: 'customer', new_status: 'open' }),
      error: null,
    });

    const response = await callRoute('this fucking service is broken');

    expect(response.status).toBe(201);
    expect(logAdminConductFlagIfNeeded).not.toHaveBeenCalled();
  });

  it('returns the committed reply on a retry without repeating moderation side effects', async () => {
    isSuperAdmin.mockResolvedValue(true);
    commitSupportTicketReply
      .mockResolvedValueOnce({ data: replyResult(), error: null })
      .mockResolvedValueOnce({ data: replyResult({ created: false }), error: null });

    expect((await callRoute('Same text')).status).toBe(201);
    expect((await callRoute('Same text')).status).toBe(200);
    expect(commitSupportTicketReply).toHaveBeenCalledTimes(2);
    expect(logAdminConductFlagIfNeeded).toHaveBeenCalledTimes(1);
  });

  it('maps a changed payload under the same operation key to a conflict', async () => {
    isSuperAdmin.mockResolvedValue(true);
    commitSupportTicketReply.mockResolvedValue({
      data: null,
      error: { message: 'support_ticket_operation_conflict' },
    });

    const response = await callRoute('Changed text');

    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ error: { code: 'OPERATION_CONFLICT' } });
  });

  it('maps a locked-ticket result from the atomic transaction', async () => {
    isSuperAdmin.mockResolvedValue(false);
    getUser.mockResolvedValue({ data: { user: { id: TICKET_OWNER_ID } } });
    commitSupportTicketReply.mockResolvedValue({ data: null, error: { message: 'support_ticket_locked' } });

    const response = await callRoute('A reply after resolution');

    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ error: { code: 'TICKET_LOCKED' } });
    expect(commitSupportTicketReply).toHaveBeenCalledWith('commit_support_ticket_reply', expect.objectContaining({
      p_ticket_id: TICKET_ID,
      p_actor_id: TICKET_OWNER_ID,
      p_sender_role: 'customer',
    }));
  });

  it('tells users to check the ticket when the transaction result is unknown', async () => {
    isSuperAdmin.mockResolvedValue(false);
    getUser.mockResolvedValue({ data: { user: { id: TICKET_OWNER_ID } } });
    commitSupportTicketReply.mockResolvedValue({ data: null, error: { message: 'connection reset' } });

    const response = await callRoute('Reply body');

    expect(response.status).toBe(503);
    const payload = await response.json();
    expect(payload).toMatchObject({ error: { code: 'WRITE_UNAVAILABLE' } });
    expect(payload.error.message).not.toContain('connection reset');
  });
});

describe('GET /api/support/tickets/[id]/replies', () => {
  beforeEach(() => {
    getUser.mockReset().mockResolvedValue({ data: { user: { id: TICKET_OWNER_ID } } });
    isSuperAdmin.mockReset().mockResolvedValue(false);
    createServiceClient.mockReset();
  });

  it('returns a bounded earlier page after verifying ticket ownership', async () => {
    const query: Record<string, (...args: unknown[]) => unknown> = {};
    query.select = vi.fn(() => query);
    query.eq = vi.fn(() => query);
    query.or = vi.fn(() => query);
    query.order = vi.fn(() => query);
    query.limit = vi.fn(async () => ({
      data: Array.from({ length: 31 }, (_, index) => {
        const number = 31 - index;
        return {
        id: `reply-${String(number).padStart(2, '0')}`,
        sender_id: TICKET_OWNER_ID,
        sender_role: 'customer',
        body: `Reply ${number}`,
        attachment_url: null,
        created_at: new Date(Date.UTC(2026, 0, number)).toISOString(),
        };
      }),
      error: null,
    }));
    createServiceClient.mockReturnValue({
      from: (table: string) => table === 'support_tickets'
        ? { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { id: TICKET_ID, user_id: TICKET_OWNER_ID }, error: null }) }) }) }
        : query,
    });
    const cursor = { createdAt: '2026-02-01T00:00:00.000Z', id: '33333333-3333-4333-8333-333333333333' };
    const response = await GET(new Request(`http://localhost/api/support/tickets/${TICKET_ID}/replies?beforeCreatedAt=${encodeURIComponent(cursor.createdAt)}&beforeId=${cursor.id}`), {
      params: Promise.resolve({ id: TICKET_ID }),
    });
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(query.or).toHaveBeenCalledWith(`created_at.lt.${cursor.createdAt},and(created_at.eq.${cursor.createdAt},id.lt.${cursor.id})`);
    expect(query.limit).toHaveBeenCalledWith(31);
    expect(payload.data.replies).toHaveLength(30);
    expect(payload.data.replies[0].body).toBe('Reply 2');
    expect(payload.data.nextCursor).toEqual({ createdAt: new Date(Date.UTC(2026, 0, 2)).toISOString(), id: 'reply-02' });
    expect(JSON.stringify(payload)).not.toContain('sender_id');
  });

  it('does not return replies for another account and rejects a malformed cursor', async () => {
    const query = { select: vi.fn(() => query), eq: vi.fn(() => query), order: vi.fn(() => query), limit: vi.fn() };
    createServiceClient.mockReturnValue({
      from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { id: TICKET_ID, user_id: 'other-customer' }, error: null }) }) }) }),
    });
    const forbidden = await GET(new Request(`http://localhost/api/support/tickets/${TICKET_ID}/replies`), { params: Promise.resolve({ id: TICKET_ID }) });
    expect(forbidden.status).toBe(403);

    const invalidCursor = await GET(new Request(`http://localhost/api/support/tickets/${TICKET_ID}/replies?beforeCreatedAt=bad&beforeId=${REPLY_ID}`), { params: Promise.resolve({ id: TICKET_ID }) });
    expect(invalidCursor.status).toBe(400);
    expect(query.limit).not.toHaveBeenCalled();
  });
});
