import { beforeEach, describe, expect, it, vi } from 'vitest';

const getUser = vi.fn();
const createServiceClient = vi.fn();
const reopenSupportTicket = vi.fn();

vi.mock('@/lib/supabase/server', () => ({ createClient: async () => ({ auth: { getUser } }) }));
vi.mock('@/lib/supabase/service', () => ({ createServiceClient }));

const { POST } = await import('../route');
const TICKET_ID = '11111111-1111-4111-8111-111111111111';
const OWNER_ID = 'customer-1';

function callRoute() {
  return POST(new Request(`http://localhost/api/support/tickets/${TICKET_ID}/reopen`, { method: 'POST' }), {
    params: Promise.resolve({ id: TICKET_ID }),
  });
}

describe('POST /api/support/tickets/[id]/reopen', () => {
  beforeEach(() => {
    getUser.mockReset().mockResolvedValue({ data: { user: { id: OWNER_ID } } });
    createServiceClient.mockReset().mockReturnValue({ rpc: reopenSupportTicket });
    reopenSupportTicket.mockReset().mockResolvedValue({
      data: { id: TICKET_ID, status: 'in_progress', changed: true },
      error: null,
    });
  });

  it('delegates ownership, transition and notification to the atomic database operation', async () => {
    const response = await callRoute();

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ data: { id: TICKET_ID, status: 'in_progress', changed: true } });
    expect(reopenSupportTicket).toHaveBeenCalledWith('reopen_support_ticket', {
      p_ticket_id: TICKET_ID,
      p_actor_id: OWNER_ID,
    });
  });

  it('returns the unchanged state on a repeated reopen without a second notice', async () => {
    reopenSupportTicket.mockResolvedValue({
      data: { id: TICKET_ID, status: 'in_progress', changed: false },
      error: null,
    });

    const response = await callRoute();

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ data: { status: 'in_progress', changed: false } });
    expect(reopenSupportTicket).toHaveBeenCalledTimes(1);
  });

  it('maps ownership and not-found errors without exposing database messages', async () => {
    reopenSupportTicket.mockResolvedValue({ data: null, error: { message: 'support_ticket_forbidden' } });

    const response = await callRoute();

    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ error: { code: 'FORBIDDEN' } });
  });

  it('asks the user to check ticket status after an unknown write result', async () => {
    reopenSupportTicket.mockResolvedValue({ data: null, error: { message: 'connection reset' } });

    const response = await callRoute();
    const payload = await response.json();

    expect(response.status).toBe(503);
    expect(payload).toMatchObject({ error: { code: 'WRITE_UNAVAILABLE' } });
    expect(payload.error.message).not.toContain('connection reset');
  });
});
