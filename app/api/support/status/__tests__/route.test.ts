import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ getUser: vi.fn(), from: vi.fn(), query: vi.fn() }));
vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({ auth: { getUser: mocks.getUser }, from: mocks.from })),
}));
vi.mock('@/lib/supabase/service', () => ({
  createServiceClient: vi.fn(() => ({ rpc: vi.fn(async () => ({ data: [], error: null })) })),
}));

import { POST } from '../route';

function request(body: unknown) {
  return new Request('http://localhost/api/support/status', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('POST /api/support/status ownership', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.query.mockImplementation(() => {
      const builder: Record<string, unknown> = {};
      for (const method of ['select', 'eq', 'order', 'limit']) builder[method] = vi.fn(() => builder);
      builder.then = (resolve: (value: unknown) => unknown) => Promise.resolve({ data: [], error: null }).then(resolve);
      return builder;
    });
    mocks.from.mockImplementation(() => mocks.query());
    mocks.getUser.mockResolvedValue({ data: { user: { id: 'customer-a', app_metadata: { role: 'super_admin' } } }, error: null });
  });

  it('scopes each lookup to the current authenticated user even when that user is staff', async () => {
    const firstQuery = mocks.query();
    const secondQuery = mocks.query();
    mocks.from.mockImplementationOnce(() => firstQuery).mockImplementationOnce(() => secondQuery);

    expect((await POST(request({ kind: 'orders' }))).status).toBe(200);
    mocks.getUser.mockResolvedValue({ data: { user: { id: 'customer-b' } }, error: null });
    expect((await POST(request({ kind: 'orders' }))).status).toBe(200);

    expect(firstQuery.eq).toHaveBeenCalledWith('user_id', 'customer-a');
    expect(secondQuery.eq).toHaveBeenCalledWith('user_id', 'customer-b');
  });

  it('requires login and rejects unsupported status kinds before querying records', async () => {
    mocks.getUser.mockResolvedValue({ data: { user: null }, error: null });
    expect((await POST(request({ kind: 'orders' }))).status).toBe(401);
    expect(mocks.from).not.toHaveBeenCalled();

    mocks.getUser.mockResolvedValue({ data: { user: { id: 'customer-a' } }, error: null });
    expect((await POST(request({ kind: 'kyc', userId: 'customer-a' }))).status).toBe(422);
    expect(mocks.from).not.toHaveBeenCalled();
  });

  it('rejects a caller-supplied owner even when the requested record kind is valid', async () => {
    mocks.getUser.mockResolvedValue({ data: { user: { id: 'customer-a' } }, error: null });

    const response = await POST(request({ kind: 'orders', userId: 'customer-b' }));

    expect(response.status).toBe(422);
    expect(mocks.from).not.toHaveBeenCalled();
  });
});
