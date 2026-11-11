import { beforeEach, describe, expect, it, vi } from 'vitest';

const getUser = vi.fn();
const createServiceClient = vi.fn();
const notifyTicketReopened = vi.fn();

vi.mock('@/lib/supabase/server', () => ({ createClient: async () => ({ auth: { getUser } }) }));
vi.mock('@/lib/supabase/service', () => ({ createServiceClient }));
vi.mock('@/lib/support/notify', () => ({ notifyTicketReopened }));

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
    createServiceClient.mockReset();
    notifyTicketReopened.mockReset().mockResolvedValue(undefined);
  });

  it('reports a database read failure instead of telling the customer the ticket is missing', async () => {
    createServiceClient.mockReturnValue({
      from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: new Error('database unavailable') }) }) }) }),
    });

    const response = await callRoute();

    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({ error: { code: 'READ_UNAVAILABLE' } });
  });

  it('reconciles a concurrent reopen without sending a duplicate notification', async () => {
    let readCount = 0;
    createServiceClient.mockReturnValue({
      from: () => ({
        select: () => ({
          eq: () => ({
            maybeSingle: async () => {
              readCount += 1;
              return readCount === 1
                ? { data: { id: TICKET_ID, subject: 'Help', user_id: OWNER_ID, assigned_to: null, status: 'closed' }, error: null }
                : { data: { id: TICKET_ID, status: 'in_progress' }, error: null };
            },
          }),
        }),
        update: () => ({
          eq: () => ({
            in: () => ({
              select: () => ({ maybeSingle: async () => ({ data: null, error: null }) }),
            }),
          }),
        }),
      }),
    });

    const response = await callRoute();

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ data: { id: TICKET_ID, status: 'in_progress' } });
    expect(notifyTicketReopened).not.toHaveBeenCalled();
  });
});
