import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  rpc: vi.fn(),
  serviceFrom: vi.fn(),
  generateAiText: vi.fn(),
}));

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser: mocks.getUser },
    rpc: mocks.rpc,
  })),
}));

vi.mock('@/lib/supabase/service', () => ({
  createServiceClient: vi.fn(() => ({ from: mocks.serviceFrom })),
}));

vi.mock('@/lib/ai/provider', () => ({
  generateAiText: mocks.generateAiText,
}));

import { PATCH, POST } from '@/app/api/admin/recommendations/[id]/localization/route';

const recommendationId = '3bd3f3ef-8e4c-4bbc-b7f5-be5d9f9ae9fe';

describe('POST /api/admin/recommendations/:id/localization', () => {
  beforeEach(() => vi.clearAllMocks());

  it('rejects unauthenticated callers before loading recommendation evidence', async () => {
    mocks.getUser.mockResolvedValue({ data: { user: null }, error: null });

    const response = await POST(new Request(`http://localhost/api/admin/recommendations/${recommendationId}/localization`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ action: 'suggest_place' }),
    }), { params: Promise.resolve({ id: recommendationId }) });

    expect(response.status).toBe(401);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it('rejects an approver because localization is Super Admin-only', async () => {
    mocks.getUser.mockResolvedValue({ data: { user: { id: 'user-1' } }, error: null });
    mocks.rpc.mockResolvedValue({ data: false, error: null });

    const response = await POST(new Request(`http://localhost/api/admin/recommendations/${recommendationId}/localization`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ action: 'suggest_place' }),
    }), { params: Promise.resolve({ id: recommendationId }) });

    expect(response.status).toBe(403);
    expect(mocks.rpc).toHaveBeenCalledWith('is_super_admin', { uid: 'user-1' });
  });

  it('does not call the AI provider before a recommendation is approved', async () => {
    mocks.getUser.mockResolvedValue({ data: { user: { id: 'super-admin-1' } }, error: null });
    mocks.rpc.mockResolvedValue({ data: true, error: null });
    mocks.serviceFrom.mockImplementation((table: string) => {
      if (table !== 'vendor_recommendations') throw new Error(`unexpected table ${table}`);
      return {
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({
              data: { id: recommendationId, vendor_name: 'Kedai Amanah', description: 'A legitimate local business description.', status: 'pending' },
              error: null,
            }),
          }),
        }),
      };
    });

    const response = await POST(new Request(`http://localhost/api/admin/recommendations/${recommendationId}/localization`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ action: 'generate' }),
    }), { params: Promise.resolve({ id: recommendationId }) });

    expect(response.status).toBe(409);
  });

  it('generates source-bound Chinese and Malay drafts only after approval', async () => {
    mocks.getUser.mockResolvedValue({ data: { user: { id: 'super-admin-1' } }, error: null });
    mocks.rpc.mockResolvedValue({ data: true, error: null });
    mocks.generateAiText.mockResolvedValue({ available: true, provider: 'modelscope', model: 'test-model', content: 'Terjemahan selamat' });
    mocks.serviceFrom.mockImplementation((table: string) => {
      if (table === 'vendor_recommendations') {
        return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { id: recommendationId, vendor_name: 'Kedai Amanah +6012-345 6789', description: 'Email vendor@example.com or visit https://vendor.example/menu.', status: 'approved' }, error: null }) }) }) };
      }
      if (table === 'content_translation_generation_locks') {
        return {
          delete: () => ({ match: () => ({ lt: async () => ({ error: null }) }) }),
          insert: async () => ({ error: null }),
        };
      }
      if (table === 'content_translations') {
        return {
          select: () => ({ match: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }),
          upsert: async () => ({ error: null }),
        };
      }
      throw new Error(`unexpected table ${table}`);
    });

    const response = await POST(new Request(`http://localhost/api/admin/recommendations/${recommendationId}/localization`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ action: 'generate' }),
    }), { params: Promise.resolve({ id: recommendationId }) });

    expect(response.status).toBe(200);
    expect(mocks.generateAiText).toHaveBeenCalledTimes(4);
    expect(mocks.generateAiText.mock.calls.map((call) => call[1]).join('\n')).not.toContain('vendor@example.com');
    expect(mocks.generateAiText.mock.calls.map((call) => call[1]).join('\n')).not.toContain('+6012-345 6789');
    expect(mocks.generateAiText.mock.calls.map((call) => call[1]).join('\n')).not.toContain('vendor.example');
  });
});

describe('PATCH /api/admin/recommendations/:id/localization', () => {
  beforeEach(() => vi.clearAllMocks());

  it('rejects an approver before accepting a translation approval', async () => {
    mocks.getUser.mockResolvedValue({ data: { user: { id: 'approver-1' } }, error: null });
    mocks.rpc.mockResolvedValue({ data: false, error: null });

    const response = await PATCH(new Request(`http://localhost/api/admin/recommendations/${recommendationId}/localization`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ translationId: '4bd3f3ef-8e4c-4bbc-b7f5-be5d9f9ae9fe', translatedText: '安心咖啡店', status: 'approved' }),
    }), { params: Promise.resolve({ id: recommendationId }) });

    expect(response.status).toBe(403);
    expect(mocks.rpc).toHaveBeenCalledWith('is_super_admin', { uid: 'approver-1' });
  });

  it('sends translation review through the atomic database transition', async () => {
    mocks.getUser.mockResolvedValue({ data: { user: { id: 'super-admin-1' } }, error: null });
    mocks.rpc.mockImplementation(async (name: string) => name === 'is_super_admin'
      ? { data: true, error: null }
      : { data: null, error: null });

    const response = await PATCH(new Request(`http://localhost/api/admin/recommendations/${recommendationId}/localization`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ translationId: '4bd3f3ef-8e4c-4bbc-b7f5-be5d9f9ae9fe', translatedText: '安心咖啡店', status: 'approved' }),
    }), { params: Promise.resolve({ id: recommendationId }) });

    expect(response.status).toBe(200);
    expect(mocks.rpc).toHaveBeenCalledWith('admin_review_recommendation_translation', expect.objectContaining({
      p_rec_id: recommendationId,
      p_status: 'approved',
    }));
  });
});
