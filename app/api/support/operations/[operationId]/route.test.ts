import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ getUser: vi.fn(), from: vi.fn(), guestCredential: vi.fn(), tokenHash: vi.fn() }));
function query(result: unknown) {
  const terminal = Promise.resolve(result);
  const builder: Record<string, ReturnType<typeof vi.fn>> = {};
  for (const method of ['select', 'eq', 'is']) builder[method] = vi.fn(() => builder);
  builder.maybeSingle = vi.fn(() => terminal);
  builder.then = terminal.then.bind(terminal) as ReturnType<typeof vi.fn>;
  return builder;
}
vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn(async () => ({ auth: { getUser: mocks.getUser } })) }));
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
    mocks.getUser.mockResolvedValue({ data: { user: { id: 'owner' } } });
    mocks.guestCredential.mockReturnValue('guest-secret');
    mocks.tokenHash.mockReturnValue('a'.repeat(64));
    mocks.from.mockImplementation((table: string) => query(table === 'support_operations' ? {
      data: {
        id: operationId, actor_key: 'user:owner', owner_user_id: 'owner', session_id: null,
        state: 'running', result_id: null, error_code: null, updated_at: new Date().toISOString(),
        lease_expires_at: new Date(Date.now() - 1000).toISOString(), external_started_at: new Date().toISOString(),
      }, error: null,
    } : { data: null, error: null }));
  });

  it('returns an expired external ask as unknown only to its owner', async () => {
    const response = await GET(new Request('https://example.test/api/support/operations'), { params: Promise.resolve({ operationId }) });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data).toMatchObject({ id: operationId, kind: 'ask', state: 'unknown' });
    expect(response.headers.get('Cache-Control')).toBe('private, no-store');
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

  it('does not let an old guest cookie read an operation after the session is claimed', async () => {
    mocks.getUser.mockResolvedValue({ data: { user: null } });
    mocks.from.mockImplementation((table: string) => query(table === 'support_operations' ? {
      data: {
        id: operationId, actor_key: `guest:${'a'.repeat(64)}`, owner_user_id: null, session_id: 'guest-session',
        state: 'completed', result_id: 'answer-id', error_code: null, updated_at: new Date().toISOString(),
        lease_expires_at: null, external_started_at: null,
      }, error: null,
    } : { data: null, error: null }));

    const response = await GET(new Request('https://example.test/api/support/operations'), { params: Promise.resolve({ operationId }) });

    expect(response.status).toBe(404);
  });
});
