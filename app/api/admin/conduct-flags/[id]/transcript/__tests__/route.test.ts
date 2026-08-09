import { beforeEach, describe, expect, it, vi } from 'vitest';

const getUser = vi.fn();
const isSuperAdmin = vi.fn();
const createServiceClient = vi.fn();

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({ auth: { getUser } }),
}));
vi.mock('@/lib/supabase/service', () => ({ createServiceClient }));
vi.mock('@/lib/affiliate/admin-guard', () => ({ isSuperAdmin }));

const { GET } = await import('../route');

const FLAG_ID = '11111111-1111-4111-8111-111111111111';

function callRoute() {
  return GET(new Request(`http://localhost/api/admin/conduct-flags/${FLAG_ID}/transcript`), {
    params: Promise.resolve({ id: FLAG_ID }),
  });
}

function mockClient(opts: {
  flag?: { source: string; source_ref_id: string } | null;
  session?: { id: string } | null;
  messages?: { role: string; body: string; created_at: string }[];
}) {
  createServiceClient.mockReturnValue({
    from: (table: string) => {
      if (table === 'admin_conduct_flags') {
        return { select: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: opts.flag ?? null, error: null }) }) }) };
      }
      if (table === 'chatbot_sessions') {
        return { select: () => ({ eq: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: opts.session ?? null, error: null }) }) }) }) };
      }
      return { select: () => ({ eq: () => ({ order: () => Promise.resolve({ data: opts.messages ?? [], error: null }) }) }) };
    },
  });
}

describe('GET /api/admin/conduct-flags/[id]/transcript', () => {
  beforeEach(() => {
    getUser.mockReset();
    isSuperAdmin.mockReset();
    createServiceClient.mockReset();
    getUser.mockResolvedValue({ data: { user: { id: 'admin-2' } } });
    isSuperAdmin.mockResolvedValue(true);
  });

  it('requires an authenticated user', async () => {
    getUser.mockResolvedValue({ data: { user: null } });
    const response = await callRoute();
    expect(response.status).toBe(401);
  });

  it('requires super_admin', async () => {
    isSuperAdmin.mockResolvedValue(false);
    const response = await callRoute();
    expect(response.status).toBe(403);
  });

  it('404s for an unknown flag', async () => {
    mockClient({ flag: null });
    const response = await callRoute();
    expect(response.status).toBe(404);
  });

  it('400s when the flag is not admin_ai sourced', async () => {
    mockClient({ flag: { source: 'ticket_reply', source_ref_id: 'ticket-1' } });
    const response = await callRoute();
    expect(response.status).toBe(400);
  });

  it('returns an empty message list when the session cannot be found', async () => {
    mockClient({ flag: { source: 'admin_ai', source_ref_id: 'session-key-1' }, session: null });
    const response = await callRoute();
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ data: { messages: [] } });
  });

  it('returns the transcript for a different admin than the caller (reviewer is not the owner)', async () => {
    mockClient({
      flag: { source: 'admin_ai', source_ref_id: 'session-key-1' },
      session: { id: 'session-1' },
      messages: [{ role: 'user', body: 'you idiot', created_at: '2026-08-09T00:00:00.000Z' }],
    });
    const response = await callRoute();
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ data: { messages: [{ role: 'user', text: 'you idiot' }] } });
  });
});
