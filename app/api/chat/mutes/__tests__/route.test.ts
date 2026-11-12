import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ getUser: vi.fn(), from: vi.fn() }));

function query(result: unknown) {
  const builder: Record<string, ReturnType<typeof vi.fn>> = {};
  for (const method of ['select', 'eq']) builder[method] = vi.fn(() => builder);
  builder.then = vi.fn((resolve: (value: unknown) => unknown) => Promise.resolve(result).then(resolve));
  return builder;
}

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({ auth: { getUser: mocks.getUser }, from: mocks.from })),
}));

import { GET } from '../route';

describe('GET /api/chat/mutes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getUser.mockResolvedValue({ data: { user: { id: 'customer-1' } } });
  });

  it('returns a stable retryable error without exposing database diagnostics', async () => {
    mocks.from.mockReturnValue(query({
      data: null,
      error: { code: 'XX000', message: 'connection failed at internal-chat-db-4' },
    }));

    const response = await GET();
    const payload = await response.json();

    expect(response.status).toBe(503);
    expect(payload.error.code).toBe('READ_UNAVAILABLE');
    expect(payload.error.message).toBe('Unable to load muted conversations. Please try again.');
    expect(JSON.stringify(payload)).not.toContain('internal-chat-db-4');
    expect(payload.error.requestId).toEqual(expect.any(String));
  });
});
