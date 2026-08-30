import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  from: vi.fn(),
  update: vi.fn(),
  updateEq: vi.fn(),
  select: vi.fn(),
  selectEq: vi.fn(),
  single: vi.fn(),
}));

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser: mocks.getUser },
    from: mocks.from,
  })),
}));

import { POST } from '../route';

function request(body: Record<string, unknown>) {
  return new Request('http://localhost/api/profile/update', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('POST /api/profile/update', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getUser.mockResolvedValue({
      data: { user: { id: '11111111-1111-4111-8111-111111111111' } },
      error: null,
    });
    mocks.from.mockReturnValue({ update: mocks.update, select: mocks.select });
    mocks.update.mockReturnValue({ eq: mocks.updateEq });
    mocks.updateEq.mockResolvedValue({ error: null });
    mocks.select.mockReturnValue({ eq: mocks.selectEq });
    mocks.selectEq.mockReturnValue({ single: mocks.single });
    mocks.single.mockResolvedValue({ data: { tier: 'profile_complete' }, error: null });
  });

  it('rejects legacy phone mutations before touching the verified profile', async () => {
    const response = await POST(request({
      fullName: 'Aina Rahman',
      city: 'Kuala Lumpur',
      country: 'Malaysia',
      phone: '+60123456789',
    }));

    expect(response.status).toBe(422);
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it('rejects identity data that does not satisfy the canonical profile schema', async () => {
    const response = await POST(request({
      fullName: 'A',
      city: 'Kuala Lumpur',
      country: 'Malaysia',
    }));

    expect(response.status).toBe(422);
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it('continues to allow canonical non-phone identity fields', async () => {
    const response = await POST(request({
      fullName: 'Aina Rahman',
      city: 'Kuala Lumpur',
      country: 'Malaysia',
    }));

    expect(response.status).toBe(200);
    expect(mocks.update).toHaveBeenCalledWith({
      full_name: 'Aina Rahman',
      city: 'Kuala Lumpur',
      country: 'Malaysia',
      city_id: null,
      country_code: 'MY',
      city_source: 'manual',
    });
    expect(mocks.select).toHaveBeenCalledWith('tier');
    await expect(response.json()).resolves.toMatchObject({
      data: { verificationTier: 'profile_complete' },
    });
  });
});
