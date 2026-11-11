import { beforeEach, describe, expect, it, vi } from 'vitest';

// CLAUDE-ADMIN-CONDUCT.md added one new conditional call to this
// pre-existing route (app/api/support/tickets/[id]/replies/route.ts).
// This file only covers that new behavior — the route had no prior test
// coverage to preserve, so the customer-reply / locked-ticket / assignment
// branches are exercised only incidentally, not exhaustively.

const getUser = vi.fn();
const isSuperAdmin = vi.fn();
const createServiceClient = vi.fn();
const notifyTicketReply = vi.fn();
const logModerationFlag = vi.fn();
const logAdminConductFlagIfNeeded = vi.fn();

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({ auth: { getUser } }),
}));
vi.mock('@/lib/supabase/service', () => ({ createServiceClient }));
vi.mock('@/lib/affiliate/admin-guard', () => ({ isSuperAdmin }));
vi.mock('@/lib/support/notify', () => ({ notifyTicketReply }));
vi.mock('@/lib/moderation/flags', () => ({ logModerationFlag }));
vi.mock('@/lib/moderation/admin-conduct', () => ({ logAdminConductFlagIfNeeded }));

const { POST } = await import('../route');

const TICKET_ID = '11111111-1111-4111-8111-111111111111';
const TICKET_OWNER_ID = 'customer-1';
const OPERATION_ID = '7b456ed4-615e-4210-a704-840abc4c1790';

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

function mockClient(ticket: { status?: string; assigned_to?: string | null } = {}) {
  let existingReply: Record<string, unknown> | null = null;
  const ticketRow = { id: TICKET_ID, subject: 'Help', user_id: TICKET_OWNER_ID, assigned_to: null, status: 'open', ...ticket };
  createServiceClient.mockReturnValue({
    from: (table: string) => {
      if (table === 'support_tickets') {
        return {
          select: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: ticketRow, error: null }) }) }),
          update: () => ({ eq: () => Promise.resolve({ error: null }) }),
        };
      }
      if (table === 'support_ticket_replies') {
        const builder: Record<string, (...args: unknown[]) => unknown> = {};
        builder.select = () => builder;
        builder.eq = () => builder;
        builder.maybeSingle = () => Promise.resolve({ data: existingReply, error: null });
        builder.insert = (input: unknown) => {
          const values = input as Record<string, unknown>;
          const row = { ...values, id: 'reply-1', created_at: '2026-08-09T00:00:00.000Z' };
          return { select: () => ({ single: async () => { existingReply = row; return { data: row, error: null }; } }) };
        };
        return builder;
      }
      if (table === 'moderation_custom_words') {
        return { select: () => ({ eq: () => Promise.resolve({ data: [] }) }) };
      }
      return {
        insert: () => ({
          select: () => ({
            single: () => Promise.resolve({
              data: { id: 'reply-1', sender_id: 'caller-1', sender_role: 'admin', body: 'masked body', created_at: '2026-08-09T00:00:00.000Z' },
              error: null,
            }),
          }),
        }),
      };
    },
  });
}

describe('POST /api/support/tickets/[id]/replies — admin conduct flagging', () => {
  beforeEach(() => {
    getUser.mockReset();
    isSuperAdmin.mockReset();
    createServiceClient.mockReset();
    notifyTicketReply.mockReset().mockResolvedValue(undefined);
    logModerationFlag.mockReset().mockResolvedValue(undefined);
    logAdminConductFlagIfNeeded.mockReset().mockResolvedValue(undefined);
    getUser.mockResolvedValue({ data: { user: { id: 'caller-1' } } });
  });

  it('flags an admin reply containing profanity, targeting the ticket owner', async () => {
    isSuperAdmin.mockResolvedValue(true);
    mockClient();

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

  it('does not flag a customer reply, even with profanity', async () => {
    isSuperAdmin.mockResolvedValue(false);
    getUser.mockResolvedValue({ data: { user: { id: TICKET_OWNER_ID } } }); // the caller IS the ticket owner
    mockClient();

    const response = await callRoute('this fucking service is broken');

    expect(response.status).toBe(201);
    expect(logAdminConductFlagIfNeeded).not.toHaveBeenCalled();
  });

  it('returns the existing reply for a repeated operation without notifying twice', async () => {
    isSuperAdmin.mockResolvedValue(true);
    mockClient();

    expect((await callRoute('Same text')).status).toBe(201);
    expect((await callRoute('Same text')).status).toBe(200);
    expect(notifyTicketReply).toHaveBeenCalledTimes(1);
  });

  it('rejects changed reply text under a previously used operation key', async () => {
    isSuperAdmin.mockResolvedValue(true);
    mockClient();

    expect((await callRoute('Original text')).status).toBe(201);
    const response = await callRoute('Changed text');
    expect(response.status).toBe(409);
    expect(notifyTicketReply).toHaveBeenCalledTimes(1);
  });

  it('calls the flagger with a clean cleaned() result for an ordinary admin reply', async () => {
    // The route only gates on senderRole==='admin' — the no-op-when-clean
    // decision lives inside logAdminConductFlagIfNeeded itself (see
    // lib/moderation/__tests__/admin-conduct.test.ts), not at the call site.
    isSuperAdmin.mockResolvedValue(true);
    mockClient();

    const response = await callRoute('Thanks for reaching out, let me check on that.');

    expect(response.status).toBe(201);
    expect(logAdminConductFlagIfNeeded).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      cleaned: expect.objectContaining({ hadProfanity: false, hadSlur: false }),
    }));
  });
});
