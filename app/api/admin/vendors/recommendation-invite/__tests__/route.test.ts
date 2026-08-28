import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  rpc: vi.fn(),
  serviceFrom: vi.fn(),
  recommendationUpdate: vi.fn(),
  recommendationUpdateEq: vi.fn(),
  inviteInsert: vi.fn(),
  inviteUpdate: vi.fn(),
  inviteUpdateEq: vi.fn(),
  sendCustomVendorEmail: vi.fn(),
  order: [] as string[],
}));

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({ auth: { getUser: mocks.getUser }, rpc: mocks.rpc })),
}));
vi.mock('@/lib/supabase/service', () => ({
  createServiceClient: vi.fn(() => ({ from: mocks.serviceFrom })),
}));
vi.mock('@/lib/email/sender', () => ({ sendCustomVendorEmail: mocks.sendCustomVendorEmail }));

import { POST } from '../route';

const RECOMMENDATION_ID = '11111111-1111-4111-8111-111111111111';

function request(overrides: Record<string, unknown> = {}) {
  return new Request('http://localhost/api/admin/vendors/recommendation-invite', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      recommendationId: RECOMMENDATION_ID,
      email: 'owner@example.com',
      ...overrides,
    }),
  });
}

function customRequest(overrides: Record<string, unknown> = {}) {
  return request({
    subject: 'Join MyWisata',
    body: 'We would love to have you on the platform.',
    ...overrides,
  });
}

describe('POST /api/admin/vendors/recommendation-invite', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.order.length = 0;
    mocks.getUser.mockResolvedValue({ data: { user: { id: 'admin-1' } }, error: null });
    mocks.rpc.mockResolvedValue({ data: true, error: null });
    mocks.recommendationUpdateEq.mockResolvedValue({ error: null });
    mocks.recommendationUpdate.mockImplementation(() => {
      mocks.order.push('mark-invited');
      return { eq: mocks.recommendationUpdateEq };
    });
    mocks.inviteInsert.mockImplementation(() => {
      mocks.order.push('insert-invite');
      return {
        select: () => ({
          single: vi.fn().mockResolvedValue({
            data: { id: 'invite-1', expires_at: '2026-10-20T00:00:00.000Z' },
            error: null,
          }),
        }),
      };
    });
    mocks.inviteUpdate.mockImplementation(() => ({ eq: mocks.inviteUpdateEq }));
    mocks.inviteUpdateEq.mockResolvedValue({ error: null });
    mocks.serviceFrom.mockImplementation((table: string) => {
      if (table === 'vendor_recommendations') {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: vi.fn().mockResolvedValue({
                data: {
                  id: RECOMMENDATION_ID,
                  vendor_name: 'Rasa Malaysia Kitchen',
                  status: 'approved',
                },
                error: null,
              }),
            }),
          }),
          update: mocks.recommendationUpdate,
        };
      }
      if (table === 'vendor_recommendation_invites') {
        return { insert: mocks.inviteInsert, update: mocks.inviteUpdate };
      }
      throw new Error(`Unexpected table ${table}`);
    });
    mocks.sendCustomVendorEmail.mockImplementation(async () => {
      mocks.order.push('send-email');
      return { id: 'msg-1' };
    });
  });

  it('requires the recommendation review capability', async () => {
    const response = await POST(request());

    expect(response.status).toBe(201);
    expect(mocks.rpc).toHaveBeenCalledWith('can_review_recommendation', { uid: 'admin-1' });
  });

  it('denies a caller without the recommendation review capability', async () => {
    mocks.rpc.mockResolvedValue({ data: false, error: null });

    const response = await POST(request());

    expect(response.status).toBe(403);
    expect(mocks.serviceFrom).not.toHaveBeenCalled();
  });

  it('sends the fixed-template email directly before marking the recommendation invited', async () => {
    const response = await POST(request());

    expect(response.status).toBe(201);
    expect(mocks.order).toEqual(['insert-invite', 'send-email', 'mark-invited']);
    expect(mocks.sendCustomVendorEmail).toHaveBeenCalledWith(expect.objectContaining({
      to: 'owner@example.com',
      subject: expect.stringContaining('Rasa Malaysia Kitchen'),
      body: expect.stringContaining('/vendor-invite?recommendation='),
    }));
    const body = await response.json();
    expect(body).toMatchObject({
      data: { emailSent: true, statusSynced: true },
    });
    expect(body.data).not.toHaveProperty('claimUrl');
  });

  it('sends a custom email before marking the recommendation invited', async () => {
    const response = await POST(customRequest());

    expect(response.status).toBe(201);
    expect(mocks.order).toEqual(['insert-invite', 'send-email', 'mark-invited']);
    expect(mocks.sendCustomVendorEmail).toHaveBeenCalledWith(expect.objectContaining({
      to: 'owner@example.com',
      subject: 'Join MyWisata',
      body: expect.stringContaining('Complete your vendor sign-up here:'),
    }));
  });

  it('persists only the token hash and admin body, never the raw claim URL', async () => {
    await POST(customRequest());

    expect(mocks.inviteInsert).toHaveBeenCalledWith(expect.objectContaining({
      token_hash: expect.any(String),
      body: 'We would love to have you on the platform.',
    }));
    expect(JSON.stringify(mocks.inviteInsert.mock.calls)).not.toContain('/vendor-invite?recommendation=');
  });

  it('cancels the invitation and returns 502 when custom delivery fails', async () => {
    mocks.sendCustomVendorEmail.mockRejectedValue(new Error('SMTP unavailable'));

    const response = await POST(customRequest());

    expect(response.status).toBe(502);
    expect(mocks.inviteUpdate).toHaveBeenCalledWith({ status: 'cancelled' });
    expect(mocks.inviteUpdateEq).toHaveBeenCalledWith('id', 'invite-1');
    expect(mocks.recommendationUpdate).not.toHaveBeenCalled();
    await expect(response.json()).resolves.toMatchObject({
      error: { code: 'EMAIL_DELIVERY_FAILED' },
    });
  });

  it('cancels the invitation and returns 502 when fixed-template delivery fails', async () => {
    mocks.sendCustomVendorEmail.mockRejectedValue(new Error('SMTP unavailable'));

    const response = await POST(request());

    expect(response.status).toBe(502);
    expect(mocks.inviteUpdate).toHaveBeenCalledWith({ status: 'cancelled' });
    expect(mocks.recommendationUpdate).not.toHaveBeenCalled();
  });

  it('reports a delivered email separately from a failed recommendation status sync', async () => {
    mocks.recommendationUpdateEq.mockResolvedValue({ error: { message: 'write failed' } });

    const response = await POST(customRequest());

    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toMatchObject({
      data: { emailSent: true, statusSynced: false },
    });
  });

  it('rejects subject without body', async () => {
    const response = await POST(request({ subject: 'Join MyWisata' }));
    expect(response.status).toBe(422);
  });

  it('rejects subject/body without an email', async () => {
    const response = await POST(customRequest({ email: undefined }));
    expect(response.status).toBe(422);
  });
});
