import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  authorizeVendor: vi.fn(),
  authorizeOutlet: vi.fn(),
  generateContentDraft: vi.fn(),
}));

vi.mock('@/lib/vendor-authorization', () => ({
  authorizeVendor: mocks.authorizeVendor,
  authorizeOutlet: mocks.authorizeOutlet,
}));
vi.mock('@/lib/ai/content-assistant', () => ({ generateContentDraft: mocks.generateContentDraft }));

import { POST } from '../route';

const ownerAccess = {
  ok: true,
  access: {
    userId: 'owner-1',
    vendorId: 'vendor-1',
    role: 'vendor_owner',
    outletIds: ['3197969f-d0ea-41c2-ac23-9bf666289453'],
    isOwner: true,
    isOutletManager: false,
    serviceDb: {},
    authDb: {},
  },
} as const;

function request(body: Record<string, unknown>) {
  return new Request('http://localhost/api/vendors/vendor-1/ai/content', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('POST /api/vendors/[vendorId]/ai/content', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.authorizeVendor.mockResolvedValue(ownerAccess);
    mocks.authorizeOutlet.mockResolvedValue(ownerAccess);
    mocks.generateContentDraft.mockResolvedValue({ available: true, provider: 'modelscope', model: 'test-model', draft: 'A polished draft.' });
  });

  it('generates a business profile draft for the vendor owner', async () => {
    const response = await POST(request({ surface: 'business_profile', name: 'Rasa Malaysia Kitchen', businessType: 'Food & tourism', description: 'Local flavours.' }), { params: Promise.resolve({ vendorId: 'vendor-1' }) });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ data: { draft: 'A polished draft.' } });
    expect(mocks.authorizeVendor).toHaveBeenCalledWith('vendor-1', ['vendor_owner']);
    expect(mocks.generateContentDraft).toHaveBeenCalledWith('business_profile', expect.objectContaining({ name: 'Rasa Malaysia Kitchen' }));
  });

  it('uses outlet authorization for outlet-page drafts', async () => {
    mocks.generateContentDraft.mockResolvedValue({ available: true, provider: 'modelscope', model: 'test-model', draft: { title: 'Taste Georgetown', body: 'Local flavours.', cta: 'View menu' } });
    const response = await POST(request({ surface: 'outlet_page', outletId: '3197969f-d0ea-41c2-ac23-9bf666289453', outletName: 'Georgetown', heroTitle: 'Welcome', heroBody: 'Come by.' }), { params: Promise.resolve({ vendorId: 'vendor-1' }) });

    expect(response.status).toBe(200);
    expect(mocks.authorizeOutlet).toHaveBeenCalledWith('vendor-1', '3197969f-d0ea-41c2-ac23-9bf666289453');
    await expect(response.json()).resolves.toMatchObject({ data: { draft: { title: 'Taste Georgetown' } } });
  });

  it('returns an actionable message when the provider token is invalid', async () => {
    mocks.generateContentDraft.mockResolvedValue({ available: false, reason: 'authentication_failed' });

    const response = await POST(request({ surface: 'business_profile', name: 'Rasa Malaysia Kitchen' }), { params: Promise.resolve({ vendorId: 'vendor-1' }) });

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: 'AI_AUTHENTICATION_FAILED', message: expect.stringContaining('token') },
    });
  });
});
