import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  isSuperAdmin: vi.fn(),
  createServiceClient: vi.fn(),
  listCustomWords: vi.fn(),
  addCustomWord: vi.fn(),
}));

vi.mock('@/lib/supabase/server', () => ({ createClient: async () => ({ auth: { getUser: mocks.getUser } }) }));
vi.mock('@/lib/supabase/service', () => ({ createServiceClient: mocks.createServiceClient }));
vi.mock('@/lib/affiliate/admin-guard', () => ({ isSuperAdmin: mocks.isSuperAdmin }));
vi.mock('@/lib/moderation/custom-words', () => ({
  listCustomWords: mocks.listCustomWords,
  addCustomWord: mocks.addCustomWord,
}));

const { GET, POST } = await import('../route');

function postRequest(body: unknown) {
  return new Request('http://localhost/api/admin/moderation-words', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('/api/admin/moderation-words', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getUser.mockResolvedValue({ data: { user: { id: 'admin-1' } } });
    mocks.isSuperAdmin.mockResolvedValue(true);
    mocks.createServiceClient.mockReturnValue({ marker: 'service' });
  });

  describe('GET', () => {
    it('requires an authenticated user', async () => {
      mocks.getUser.mockResolvedValue({ data: { user: null } });
      const res = await GET();
      expect(res.status).toBe(401);
    });

    it('requires super admin', async () => {
      mocks.isSuperAdmin.mockResolvedValue(false);
      const res = await GET();
      expect(res.status).toBe(403);
    });

    it('returns the word list', async () => {
      mocks.listCustomWords.mockResolvedValue([{ id: 'w1', term: 'bengkok', category: 'slur', language: 'ms', isActive: true, createdAt: '2026-09-12T00:00:00Z' }]);
      const res = await GET();
      expect(res.status).toBe(200);
      await expect(res.json()).resolves.toMatchObject({ data: [{ term: 'bengkok' }] });
    });
  });

  describe('POST', () => {
    it('requires super admin', async () => {
      mocks.isSuperAdmin.mockResolvedValue(false);
      const res = await POST(postRequest({ term: 'x', category: 'profanity' }));
      expect(res.status).toBe(403);
    });

    it('rejects an invalid category', async () => {
      const res = await POST(postRequest({ term: 'x', category: 'nonsense' }));
      expect(res.status).toBe(422);
    });

    it('adds a word and returns it', async () => {
      mocks.addCustomWord.mockResolvedValue({ ok: true, word: { id: 'w1', term: 'bengkok', category: 'slur', language: null, isActive: true, createdAt: '2026-09-12T00:00:00Z' } });
      const res = await POST(postRequest({ term: 'bengkok', category: 'slur' }));
      expect(res.status).toBe(200);
      expect(mocks.addCustomWord).toHaveBeenCalledWith({ marker: 'service' }, { term: 'bengkok', category: 'slur', createdBy: 'admin-1' });
      await expect(res.json()).resolves.toMatchObject({ data: { term: 'bengkok' } });
    });

    it('surfaces a duplicate-word error as 422', async () => {
      mocks.addCustomWord.mockResolvedValue({ ok: false, error: 'This word is already on the list' });
      const res = await POST(postRequest({ term: 'bengkok', category: 'slur' }));
      expect(res.status).toBe(422);
    });
  });
});
