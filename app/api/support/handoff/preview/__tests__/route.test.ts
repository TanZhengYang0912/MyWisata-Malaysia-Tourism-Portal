import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ clean: vi.fn(), getUser: vi.fn() }));
vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn(async () => ({ auth: { getUser: mocks.getUser } })) }));
vi.mock('@/lib/supabase/service', () => ({ createServiceClient: vi.fn(() => ({})) }));
vi.mock('@/lib/moderation/clean', () => ({ cleanUserContent: mocks.clean }));

import { POST } from '../route';

function request(subject: unknown, summary: unknown) {
  return new Request('http://localhost/api/support/handoff/preview', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ subject, summary }),
  });
}

describe('POST /api/support/handoff/preview', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'test-handoff-secret');
    mocks.getUser.mockResolvedValue({ data: { user: { id: 'owner-1' } }, error: null });
    mocks.clean.mockImplementation(async (text: string) => ({ display: text.replace('012-3456789', '[PHONE]') }));
  });

  it('returns the exact cleaned title and summary without creating a ticket', async () => {
    const response = await POST(request('Help 012-3456789', 'My booking is missing. Call 012-3456789'));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      data: { subject: 'Help [PHONE]', summary: 'My booking is missing. Call [PHONE]', handoffToken: expect.any(String) },
    });
    expect(mocks.clean).toHaveBeenCalledTimes(2);
  });

  it('rejects missing or oversized preview content before moderation', async () => {
    expect((await POST(request('', 'summary'))).status).toBe(422);
    expect((await POST(request('x', 'y'.repeat(2001)))).status).toBe(422);
    expect(mocks.clean).not.toHaveBeenCalled();
  });
});
