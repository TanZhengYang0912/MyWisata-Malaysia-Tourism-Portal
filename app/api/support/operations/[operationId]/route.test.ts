import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ createAuthClient: vi.fn(), getUser: vi.fn(), from: vi.fn(), guestCredential: vi.fn(), tokenHash: vi.fn() }));
function query(result: unknown) {
  const terminal = Promise.resolve(result);
  const builder: Record<string, ReturnType<typeof vi.fn>> = {};
  for (const method of ['select', 'eq', 'is']) builder[method] = vi.fn(() => builder);
  builder.maybeSingle = vi.fn(() => terminal);
  builder.then = terminal.then.bind(terminal) as ReturnType<typeof vi.fn>;
  return builder;
}
vi.mock('@/lib/supabase/server', () => ({ createClient: mocks.createAuthClient }));
vi.mock('@/lib/supabase/service', () => ({ createServiceClient: () => ({ from: mocks.from }) }));
vi.mock('@/lib/chatbot/guest-session', () => ({
  readChatbotGuestCredential: mocks.guestCredential,
  hashChatbotGuestCredential: mocks.tokenHash,
}));

import { GET } from './route';

const operationId = '11111111-1111-4111-8111-111111111111';

describe('GET /api/support/operations/[operationId]', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.createAuthClient.mockResolvedValue({ auth: { getUser: mocks.getUser } });
    mocks.getUser.mockResolvedValue({ data: { user: { id: 'owner' } } });
    mocks.guestCredential.mockReturnValue('guest-secret');
    mocks.tokenHash.mockReturnValue('a'.repeat(64));
    mocks.from.mockImplementation((table: string) => query(table === 'support_operations' ? {
      data: {
        id: operationId, actor_key: 'user:owner', owner_user_id: 'owner', session_id: 'customer-session',
        state: 'running', result_id: null, error_code: null, updated_at: new Date().toISOString(),
        lease_expires_at: new Date(Date.now() - 1000).toISOString(), external_started_at: new Date().toISOString(),
      }, error: null,
    } : table === 'chatbot_sessions' ? { data: { id: 'customer-session' }, error: null } : { data: null, error: null }));
  });

  it('returns an expired external ask as unknown only to its owner', async () => {
    const response = await GET(new Request('https://example.test/api/support/operations'), { params: Promise.resolve({ operationId }) });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data).toMatchObject({ id: operationId, kind: 'ask', state: 'unknown' });
    expect(response.headers.get('Cache-Control')).toBe('private, no-store');
  });

  it('returns an auth outage as retryable instead of treating the caller as a guest', async () => {
    mocks.getUser.mockResolvedValue({ data: { user: null }, error: { name: 'AuthRetryableFetchError', status: 503 } });

    const response = await GET(new Request('https://example.test/api/support/operations'), { params: Promise.resolve({ operationId }) });
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(body.error.code).toBe('AUTH_UNAVAILABLE');
    expect(mocks.from).not.toHaveBeenCalled();
    expect(mocks.guestCredential).not.toHaveBeenCalled();
  });

  it('hides an operation from a different account', async () => {
    mocks.getUser.mockResolvedValue({ data: { user: { id: 'other' } } });
    mocks.from.mockImplementation((table: string) => query(table === 'support_operations' ? {
      data: {
        id: operationId, actor_key: 'user:owner', owner_user_id: 'owner', session_id: null,
        state: 'completed', result_id: 'answer-id', error_code: null, updated_at: new Date().toISOString(),
        lease_expires_at: null, external_started_at: null,
      }, error: null,
    } : { data: null, error: null }));

    const response = await GET(new Request('https://example.test/api/support/operations'), { params: Promise.resolve({ operationId }) });

    expect(response.status).toBe(404);
  });

  it('does not let an unauthenticated guest read an operation after the session is claimed', async () => {
    mocks.getUser.mockResolvedValue({ data: { user: null } });

    const response = await GET(new Request('https://example.test/api/support/operations'), { params: Promise.resolve({ operationId }) });

    expect(response.status).toBe(401);
    expect(mocks.from).not.toHaveBeenCalled();
  });

  it('does not treat an admin-channel session as a guest support operation owner', async () => {
    mocks.getUser.mockResolvedValue({ data: { user: null } });
    const response = await GET(new Request('https://example.test/api/support/operations'), { params: Promise.resolve({ operationId }) });

    expect(response.status).toBe(401);
    expect(mocks.from).not.toHaveBeenCalled();
  });

  it('does not expose an operation to its user owner when its session is not a customer session', async () => {
    const operationQuery = query({
      data: {
        id: operationId, actor_key: 'user:owner', owner_user_id: 'owner', session_id: 'admin-session',
        state: 'completed', result_id: 'answer-id', error_code: null, updated_at: new Date().toISOString(),
        lease_expires_at: null, external_started_at: null,
      }, error: null,
    });
    const sessionQuery = query({ data: null, error: null });
    mocks.from.mockImplementation((table: string) => table === 'support_operations' ? operationQuery : sessionQuery);

    const response = await GET(new Request('https://example.test/api/support/operations'), { params: Promise.resolve({ operationId }) });

    expect(response.status).toBe(404);
    expect(sessionQuery.eq).toHaveBeenCalledWith('channel', 'customer');
    expect(sessionQuery.eq).toHaveBeenCalledWith('user_id', 'owner');
  });
});
