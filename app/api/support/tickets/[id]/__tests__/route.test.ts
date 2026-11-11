import { beforeEach, describe, expect, it, vi } from 'vitest';

const getUser = vi.fn();
const createServiceClient = vi.fn();
const isSuperAdmin = vi.fn();

vi.mock('@/lib/supabase/server', () => ({ createClient: async () => ({ auth: { getUser } }) }));
vi.mock('@/lib/supabase/service', () => ({ createServiceClient }));
vi.mock('@/lib/affiliate/admin-guard', () => ({ isSuperAdmin }));

const { GET } = await import('../route');
const TICKET_ID = '11111111-1111-4111-8111-111111111111';
const REPLY_ID = '22222222-2222-4222-8222-222222222222';
const OWNER_ID = 'owner-1';

function callRoute() {
  return GET(new Request(`http://localhost/api/support/tickets/${TICKET_ID}`), {
    params: Promise.resolve({ id: TICKET_ID }),
  });
}

function mockService(overrides: { ticketUserId?: string; ticketError?: Error | null } = {}) {
  const replyQuery = vi.fn();
  createServiceClient.mockReturnValue({
    from: (table: string) => {
      if (table === 'support_tickets') {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({
                data: { id: TICKET_ID, user_id: overrides.ticketUserId ?? OWNER_ID, session_id: null, withdrawal_id: null, subject: 'Question', body: 'Help', category: 'general', status: 'open', assigned_to: null, created_at: '2026-11-11T00:00:00.000Z', resolved_at: null, last_reply_at: null },
                error: overrides.ticketError ?? null,
              }),
            }),
          }),
        };
      }
      if (table === 'support_ticket_replies') {
        replyQuery();
        const builder: Record<string, (...args: unknown[]) => unknown> = {};
        builder.select = () => builder;
        builder.eq = () => builder;
        builder.order = async () => ({
          data: [{ id: REPLY_ID, sender_id: OWNER_ID, sender_role: 'customer', body: 'Receipt', attachment_url: `${TICKET_ID}/${REPLY_ID}.png`, created_at: '2026-11-11T00:01:00.000Z' }],
          error: null,
        });
        return builder;
      }
      if (table === 'ticket_mutes') {
        const builder: Record<string, (...args: unknown[]) => unknown> = {};
        builder.select = () => builder;
        builder.eq = () => builder;
        builder.maybeSingle = async () => ({ data: null, error: null });
        return builder;
      }
      throw new Error(`Unexpected table ${table}`);
    },
  });
  return { replyQuery };
}

describe('GET /api/support/tickets/[id]', () => {
  beforeEach(() => {
    getUser.mockReset().mockResolvedValue({ data: { user: { id: OWNER_ID } } });
    isSuperAdmin.mockReset().mockResolvedValue(false);
    createServiceClient.mockReset();
  });

  it('returns attachment type metadata without exposing the private storage path', async () => {
    const { replyQuery } = mockService();

    const response = await callRoute();
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.data.replies[0]).toMatchObject({ id: REPLY_ID, attachment_type: 'image' });
    expect(JSON.stringify(payload)).not.toContain(`${TICKET_ID}/${REPLY_ID}.png`);
    expect(replyQuery).toHaveBeenCalledTimes(1);
  });

  it('does not read replies for another account', async () => {
    const { replyQuery } = mockService({ ticketUserId: 'other-customer' });

    const response = await callRoute();

    expect(response.status).toBe(403);
    expect(replyQuery).not.toHaveBeenCalled();
  });

  it('maps a ticket database failure to a safe read error', async () => {
    mockService({ ticketError: new Error('private database detail') });

    const response = await callRoute();
    const payload = await response.json();

    expect(response.status).toBe(503);
    expect(payload).toMatchObject({ error: { code: 'READ_UNAVAILABLE' } });
    expect(JSON.stringify(payload)).not.toContain('private database detail');
  });
});
