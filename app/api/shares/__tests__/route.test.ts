import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  authClient: {} as { auth: { getUser: () => Promise<{ data: { user: { id: string } | null } }> }; [key: string]: unknown },
  createServiceClient: vi.fn(),
  recordInteraction: vi.fn(),
}));

vi.mock('@/lib/supabase/server', () => ({ createClient: async () => mocks.authClient }));
vi.mock('@/lib/supabase/service', () => ({ createServiceClient: mocks.createServiceClient }));
vi.mock('@/lib/interactions', () => ({ recordInteraction: mocks.recordInteraction }));

const { POST } = await import('../route');

function request(body: unknown, userAgent = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit') {
  return new Request('http://localhost/api/shares', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'user-agent': userAgent },
    body: JSON.stringify(body),
  });
}

function makeClient(overrides: { insertResult?: { data: { id: string } | null; error: { message: string } | null }; linkResult?: { data: { id: string } | null } } = {}) {
  const insertResult = overrides.insertResult ?? { data: { id: 'evt-1' }, error: null };
  const linkResult = overrides.linkResult ?? { data: null };
  const insert = vi.fn().mockReturnValue({ select: () => ({ single: () => Promise.resolve(insertResult) }) });
  const from = vi.fn((table: string) => {
    if (table === 'affiliate_links') return { select: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve(linkResult) }) }) };
    if (table === 'share_events') return { insert };
    throw new Error(`unexpected table ${table}`);
  });
  return { from, insert };
}

const BODY = { shareType: 'product', contentId: '11111111-1111-4111-8111-111111111111', platform: 'native' };

describe('POST /api/shares', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("logs a logged-in user's share with their affiliate id and a classified device", async () => {
    const client = makeClient({ linkResult: { data: { id: 'link-1' } } });
    mocks.authClient = { auth: { getUser: async () => ({ data: { user: { id: 'user-1' } } }) }, ...client };

    const res = await POST(request(BODY));

    expect(res.status).toBe(201);
    expect(client.insert).toHaveBeenCalledWith(expect.objectContaining({
      user_id: 'user-1', affiliate_id: 'link-1', device: 'mobile', platform: 'native',
    }));
    expect(mocks.recordInteraction).toHaveBeenCalledWith(mocks.authClient, 'user-1', 'share', 'product', BODY.contentId);
  });

  it('logs an anonymous share via the service-role client, with a null user/affiliate id', async () => {
    mocks.authClient = { auth: { getUser: async () => ({ data: { user: null } }) } };
    const serviceClient = makeClient();
    mocks.createServiceClient.mockReturnValue(serviceClient);

    const res = await POST(request(BODY, 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'));

    expect(res.status).toBe(201);
    expect(serviceClient.insert).toHaveBeenCalledWith(expect.objectContaining({
      user_id: null, affiliate_id: null, device: 'desktop',
    }));
    expect(mocks.recordInteraction).not.toHaveBeenCalled();
  });

  it('returns a DB_ERROR response when the insert fails', async () => {
    mocks.authClient = { auth: { getUser: async () => ({ data: { user: null } }) } };
    mocks.createServiceClient.mockReturnValue(makeClient({ insertResult: { data: null, error: { message: 'boom' } } }));

    const res = await POST(request(BODY));

    expect(res.status).toBe(500);
  });
});
