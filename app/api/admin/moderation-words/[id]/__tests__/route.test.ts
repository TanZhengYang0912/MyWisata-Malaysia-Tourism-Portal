import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  isSuperAdmin: vi.fn(),
  createServiceClient: vi.fn(),
  setCustomWordActive: vi.fn(),
  removeCustomWord: vi.fn(),
}));

vi.mock('@/lib/supabase/server', () => ({ createClient: async () => ({ auth: { getUser: mocks.getUser } }) }));
vi.mock('@/lib/supabase/service', () => ({ createServiceClient: mocks.createServiceClient }));
vi.mock('@/lib/affiliate/admin-guard', () => ({ isSuperAdmin: mocks.isSuperAdmin }));
vi.mock('@/lib/moderation/custom-words', () => ({
  setCustomWordActive: mocks.setCustomWordActive,
  removeCustomWord: mocks.removeCustomWord,
}));

const { PATCH, DELETE } = await import('../route');

const ID = 'w1';
function params() { return { params: Promise.resolve({ id: ID }) }; }

function patchRequest(body: unknown) {
  return new Request(`http://localhost/api/admin/moderation-words/${ID}`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('/api/admin/moderation-words/[id]', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getUser.mockResolvedValue({ data: { user: { id: 'admin-1' } } });
    mocks.isSuperAdmin.mockResolvedValue(true);
    mocks.createServiceClient.mockReturnValue({ marker: 'service' });
  });

  describe('PATCH', () => {
    it('requires super admin', async () => {
      mocks.isSuperAdmin.mockResolvedValue(false);
      const res = await PATCH(patchRequest({ isActive: false }), params());
      expect(res.status).toBe(403);
    });

    it('toggles active state', async () => {
      const res = await PATCH(patchRequest({ isActive: false }), params());
      expect(res.status).toBe(200);
      expect(mocks.setCustomWordActive).toHaveBeenCalledWith({ marker: 'service' }, ID, false);
    });
  });

  describe('DELETE', () => {
    it('requires super admin', async () => {
      mocks.isSuperAdmin.mockResolvedValue(false);
      const res = await DELETE(new Request('http://localhost'), params());
      expect(res.status).toBe(403);
    });

    it('removes the word', async () => {
      const res = await DELETE(new Request('http://localhost'), params());
      expect(res.status).toBe(200);
      expect(mocks.removeCustomWord).toHaveBeenCalledWith({ marker: 'service' }, ID);
    });
  });
});
