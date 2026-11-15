import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
  createServiceClient: vi.fn(),
  isSuperAdmin: vi.fn(),
  getModerationFlagPage: vi.fn(),
}));

vi.mock('@/lib/supabase/server', () => ({ createClient: mocks.createClient }));
vi.mock('@/lib/supabase/service', () => ({ createServiceClient: mocks.createServiceClient }));
vi.mock('@/lib/affiliate/admin-guard', () => ({ isSuperAdmin: mocks.isSuperAdmin }));
vi.mock('@/lib/moderation/flags', () => ({ getModerationFlagPage: mocks.getModerationFlagPage }));

import { GET } from '@/app/api/admin/moderation/flags/route';

describe('admin moderation flags route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.createClient.mockResolvedValue({ auth: { getUser: async () => ({ data: { user: { id: 'admin-1' } } }) } });
    mocks.createServiceClient.mockReturnValue({ service: true });
    mocks.isSuperAdmin.mockResolvedValue(true);
    mocks.getModerationFlagPage.mockResolvedValue({ groups: [{ key: 'ticket:t1' }], page: 1, pageSize: 10, totalGroups: 1, totalFlagCount: 1, openFlagCount: 1 });
  });

  it('uses the service client only after the Super Admin check', async () => {
    const response = await GET(new Request('http://localhost/api/admin/moderation/flags?page=1'));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(mocks.isSuperAdmin).toHaveBeenCalledOnce();
    expect(mocks.createServiceClient).toHaveBeenCalledOnce();
    expect(mocks.getModerationFlagPage).toHaveBeenCalledWith({ service: true }, { page: 1, pageSize: 10, showReviewed: false, groupKey: undefined });
    expect(body.data.totalGroups).toBe(1);
  });

  it('does not create a service client for a non-admin', async () => {
    mocks.isSuperAdmin.mockResolvedValue(false);

    const response = await GET(new Request('http://localhost/api/admin/moderation/flags'));

    expect(response.status).toBe(403);
    expect(mocks.createServiceClient).not.toHaveBeenCalled();
    expect(mocks.getModerationFlagPage).not.toHaveBeenCalled();
  });

  it('returns an error instead of an empty queue when the read fails', async () => {
    mocks.getModerationFlagPage.mockRejectedValue(new Error('read failed'));

    const response = await GET(new Request('http://localhost/api/admin/moderation/flags'));

    expect(response.status).toBe(500);
  });
});
