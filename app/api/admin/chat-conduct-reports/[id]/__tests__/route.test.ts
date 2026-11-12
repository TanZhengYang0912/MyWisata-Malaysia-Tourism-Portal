import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  isSuperAdmin: vi.fn(),
  createServiceClient: vi.fn(),
  reviewChatConductReport: vi.fn(),
}));

vi.mock('@/lib/supabase/server', () => ({ createClient: async () => ({ auth: { getUser: mocks.getUser } }) }));
vi.mock('@/lib/supabase/service', () => ({ createServiceClient: mocks.createServiceClient }));
vi.mock('@/lib/affiliate/admin-guard', () => ({ isSuperAdmin: mocks.isSuperAdmin }));
vi.mock('@/lib/moderation/chat-conduct-reports', () => ({ reviewChatConductReport: mocks.reviewChatConductReport }));

import { PATCH } from '../route';

const REPORT_ID = '11111111-1111-4111-8111-111111111111';

function callRoute() {
  return PATCH(new Request(`http://localhost/api/admin/chat-conduct-reports/${REPORT_ID}`, { method: 'PATCH' }), {
    params: Promise.resolve({ id: REPORT_ID }),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getUser.mockResolvedValue({ data: { user: { id: 'admin-1' } } });
  mocks.isSuperAdmin.mockResolvedValue(true);
  mocks.createServiceClient.mockReturnValue({});
  mocks.reviewChatConductReport.mockResolvedValue('reviewed');
});

describe('PATCH /api/admin/chat-conduct-reports/[id]', () => {
  it('requires a signed-in super admin', async () => {
    mocks.getUser.mockResolvedValue({ data: { user: null } });
    expect((await callRoute()).status).toBe(401);

    mocks.getUser.mockResolvedValue({ data: { user: { id: 'staff-1' } } });
    mocks.isSuperAdmin.mockResolvedValue(false);
    expect((await callRoute()).status).toBe(403);
    expect(mocks.reviewChatConductReport).not.toHaveBeenCalled();
  });

  it('returns the already-reviewed result for a duplicate action', async () => {
    mocks.reviewChatConductReport.mockResolvedValue('already_reviewed');

    const response = await callRoute();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ data: { id: REPORT_ID, status: 'reviewed', alreadyReviewed: true } });
  });

  it('keeps a missing report distinct from a duplicate review', async () => {
    mocks.reviewChatConductReport.mockResolvedValue('not_found');
    expect((await callRoute()).status).toBe(404);
  });
});
