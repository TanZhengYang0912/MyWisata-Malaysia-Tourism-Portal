import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ getUser: vi.fn(), insert: vi.fn(), delete: vi.fn() }));
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({ auth: { getUser: mocks.getUser }, from: () => ({ insert: mocks.insert, delete: mocks.delete }) }),
}));

import { DELETE, POST } from '../route';

const ticketId = '11111111-1111-4111-8111-111111111111';
const params = { params: Promise.resolve({ id: ticketId }) };

function deleteQuery(result: unknown) {
  const builder: Record<string, unknown> = {};
  builder.eq = vi.fn(() => builder);
  builder.then = (resolve: (value: unknown) => unknown) => Promise.resolve(result).then(resolve);
  return builder;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getUser.mockResolvedValue({ data: { user: { id: 'customer-1' } } });
  mocks.insert.mockResolvedValue({ data: null, error: null });
  mocks.delete.mockReturnValue(deleteQuery({ data: null, error: null }));
});

describe('support ticket mute route failures', () => {
  it('returns a retryable safe error when muting fails', async () => {
    mocks.insert.mockResolvedValue({ error: { code: 'XX000', message: 'connection reset from internal-db-node-7' } });

    const response = await POST(new Request('http://localhost/api/support/tickets/test/mute', { method: 'POST' }), params);
    const payload = await response.json();

    expect(response.status).toBe(503);
    expect(payload.error).toMatchObject({ code: 'WRITE_UNAVAILABLE', message: 'Unable to update this support request. Please try again.' });
    expect(JSON.stringify(payload)).not.toContain('internal-db-node-7');
    expect(payload.error.requestId).toEqual(expect.any(String));
  });

  it('returns a retryable safe error when unmuting fails', async () => {
    mocks.delete.mockReturnValue(deleteQuery({ error: { code: 'XX000', message: 'connection reset from internal-db-node-7' } }));

    const response = await DELETE(new Request('http://localhost/api/support/tickets/test/mute', { method: 'DELETE' }), params);
    const payload = await response.json();

    expect(response.status).toBe(503);
    expect(payload.error).toMatchObject({ code: 'WRITE_UNAVAILABLE', message: 'Unable to update this support request. Please try again.' });
    expect(JSON.stringify(payload)).not.toContain('internal-db-node-7');
  });

  it('keeps duplicate mute idempotent', async () => {
    mocks.insert.mockResolvedValue({ error: { code: '23505', message: 'duplicate key' } });

    const response = await POST(new Request('http://localhost/api/support/tickets/test/mute', { method: 'POST' }), params);

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ data: { ticketId, muted: true } });
  });
});
