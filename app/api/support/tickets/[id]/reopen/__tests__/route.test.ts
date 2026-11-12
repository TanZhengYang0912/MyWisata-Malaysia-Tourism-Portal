import { beforeEach, describe, expect, it, vi } from 'vitest';

const getUser = vi.fn();
const createServiceClient = vi.fn();
const serviceRpc = vi.fn();
const OPERATION_ID = '22222222-2222-4222-8222-222222222222';
const LEASE_TOKEN = '33333333-3333-4333-8333-333333333333';
const TICKET_ID = '11111111-1111-4111-8111-111111111111';
const OWNER_ID = 'customer-1';

vi.mock('@/lib/supabase/server', () => ({ createClient: async () => ({ auth: { getUser } }) }));
vi.mock('@/lib/supabase/service', () => ({ createServiceClient }));

const { POST } = await import('../route');

function callRoute(operationId = OPERATION_ID) {
  return POST(new Request(`http://localhost/api/support/tickets/${TICKET_ID}/reopen`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ operationId }),
  }), {
    params: Promise.resolve({ id: TICKET_ID }),
  });
}

function configureReservation(data: unknown, error: unknown = null) {
  serviceRpc.mockImplementation((name: string) => {
    if (name === 'reserve_support_operation') return Promise.resolve({ data, error });
    if (name === 'reopen_support_ticket') return Promise.resolve({
      data: { id: TICKET_ID, status: 'in_progress', changed: true, replayed: false },
      error: null,
    });
    return Promise.resolve({ data: null, error: { message: `unexpected_rpc:${name}` } });
  });
}

describe('POST /api/support/tickets/[id]/reopen', () => {
  beforeEach(() => {
    getUser.mockReset().mockResolvedValue({ data: { user: { id: OWNER_ID } } });
    serviceRpc.mockReset();
    createServiceClient.mockReset().mockReturnValue({ rpc: serviceRpc });
    configureReservation({ state: 'running', shouldExecute: true, leaseToken: LEASE_TOKEN });
  });

  it('reserves the authenticated intent before delegating the atomic transition', async () => {
    const response = await callRoute();

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ data: { id: TICKET_ID, status: 'in_progress', changed: true } });
    expect(serviceRpc).toHaveBeenNthCalledWith(1, 'reserve_support_operation', expect.objectContaining({
      p_operation_id: OPERATION_ID,
      p_actor_key: `user:${OWNER_ID}`,
      p_owner_user_id: OWNER_ID,
      p_session_id: null,
      p_kind: 'reopen',
      p_payload_hash: expect.stringMatching(/^[0-9a-f]{64}$/),
    }));
    expect(serviceRpc).toHaveBeenNthCalledWith(2, 'reopen_support_ticket', {
      p_operation_id: OPERATION_ID,
      p_ticket_id: TICKET_ID,
      p_actor_id: OWNER_ID,
      p_operation_payload_hash: expect.stringMatching(/^[0-9a-f]{64}$/),
      p_lease_token: LEASE_TOKEN,
    });
  });

  it('calls the database with no lease token to recover a completed result', async () => {
    configureReservation({ state: 'completed', shouldExecute: false, resultId: TICKET_ID });
    serviceRpc.mockImplementation((name: string) => {
      if (name === 'reserve_support_operation') {
        return Promise.resolve({ data: { state: 'completed', shouldExecute: false, resultId: TICKET_ID }, error: null });
      }
      return Promise.resolve({
        data: { id: TICKET_ID, status: 'in_progress', changed: true, replayed: true },
        error: null,
      });
    });

    const response = await callRoute();

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ data: { changed: true, replayed: true } });
    expect(serviceRpc).toHaveBeenNthCalledWith(2, 'reopen_support_ticket', expect.objectContaining({ p_lease_token: null }));
  });

  it('does not execute again while an earlier attempt still owns the operation lease', async () => {
    configureReservation({ state: 'running', shouldExecute: false, leaseToken: null });

    const response = await callRoute();

    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ error: { code: 'OPERATION_UNKNOWN' } });
    expect(serviceRpc).toHaveBeenCalledTimes(1);
  });

  it('maps ownership errors without exposing database messages', async () => {
    serviceRpc.mockImplementation((name: string) => name === 'reserve_support_operation'
      ? Promise.resolve({ data: { state: 'running', shouldExecute: true, leaseToken: LEASE_TOKEN }, error: null })
      : Promise.resolve({ data: null, error: { message: 'support_ticket_forbidden' } }));

    const response = await callRoute();

    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ error: { code: 'FORBIDDEN' } });
  });

  it('asks the user to check ticket status after an unknown write result', async () => {
    serviceRpc.mockImplementation((name: string) => name === 'reserve_support_operation'
      ? Promise.resolve({ data: { state: 'running', shouldExecute: true, leaseToken: LEASE_TOKEN }, error: null })
      : Promise.resolve({ data: null, error: { message: 'connection reset' } }));

    const response = await callRoute();
    const payload = await response.json();

    expect(response.status).toBe(503);
    expect(payload).toMatchObject({ error: { code: 'WRITE_UNAVAILABLE' } });
    expect(payload.error.message).not.toContain('connection reset');
  });
});
