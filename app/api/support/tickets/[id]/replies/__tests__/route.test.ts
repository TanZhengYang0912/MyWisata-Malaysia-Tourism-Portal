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

const { POST } = await import('../route');

const TICKET_ID = '11111111-1111-4111-8111-111111111111';
const TICKET_OWNER_ID = 'customer-1';
const OPERATION_ID = '7b456ed4-615e-4210-a704-840abc4c1790';
const CREATED_AT = '2026-08-09T00:00:00.000Z';

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
