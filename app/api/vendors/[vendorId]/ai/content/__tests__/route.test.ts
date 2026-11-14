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

// Chainable query stub: builder calls return itself; awaiting or maybeSingle() resolves the result.
function queryResult(result: { data: unknown; error: null }) {
  const builder: Record<string, unknown> = {};
  for (const method of ['select', 'eq', 'order', 'limit']) builder[method] = vi.fn(() => builder);
  builder.maybeSingle = vi.fn(async () => result);
  builder.then = (resolve: (value: unknown) => unknown) => Promise.resolve(result).then(resolve);
  return builder;
}

function outletDb(outlet: unknown) {
  return {
    from: vi.fn((table: string) => table === 'outlets'
      ? queryResult({ data: outlet, error: null })
      : queryResult({ data: [{ name: 'Pure Sesame Oil 640ml', product_type: 'physical', categories: { name: 'Retail' } }], error: null })),
  };
}

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

  it('uses outlet authorization and real outlet facts for outlet-page drafts', async () => {
    mocks.authorizeOutlet.mockResolvedValue({
      ...ownerAccess,
      access: { ...ownerAccess.access, serviceDb: outletDb({ name: 'Jalan Burma', city: 'George Town', state: 'Penang', hotel_about: null, amenity_codes: null }) },
    });
    mocks.generateContentDraft.mockResolvedValue({ available: true, provider: 'gemini', model: 'test-model', draft: { title: 'Taste Georgetown', body: 'Local flavours.', cta: 'View menu' } });
    const response = await POST(request({ surface: 'outlet_page', outletId: '3197969f-d0ea-41c2-ac23-9bf666289453', heroTitle: 'Welcome', heroBody: 'Come by.' }), { params: Promise.resolve({ vendorId: 'vendor-1' }) });

    expect(response.status).toBe(200);
    expect(mocks.authorizeOutlet).toHaveBeenCalledWith('vendor-1', '3197969f-d0ea-41c2-ac23-9bf666289453', ['outlet_manager']);
    expect(mocks.generateContentDraft).toHaveBeenCalledWith('outlet_page', expect.objectContaining({
      outletName: 'Jalan Burma',
      location: 'George Town, Penang',
      products: [{ name: 'Pure Sesame Oil 640ml', type: 'physical', category: 'Retail' }],
      currentHeroTitle: 'Welcome',
    }));
    await expect(response.json()).resolves.toMatchObject({ data: { draft: { title: 'Taste Georgetown' } } });
  });

  it('rejects client-supplied outlet facts that the server now owns', async () => {
    const response = await POST(request({ surface: 'outlet_page', outletId: '3197969f-d0ea-41c2-ac23-9bf666289453', outletName: 'Spoofed', productNames: ['Fake'] }), { params: Promise.resolve({ vendorId: 'vendor-1' }) });

    expect(response.status).toBe(422);
    expect(mocks.generateContentDraft).not.toHaveBeenCalled();
  });

  it('returns 404 when the outlet is not in the vendor', async () => {
    mocks.authorizeOutlet.mockResolvedValue({ ...ownerAccess, access: { ...ownerAccess.access, serviceDb: outletDb(null) } });
    const response = await POST(request({ surface: 'outlet_page', outletId: '3197969f-d0ea-41c2-ac23-9bf666289453' }), { params: Promise.resolve({ vendorId: 'vendor-1' }) });

    expect(response.status).toBe(404);
    expect(mocks.generateContentDraft).not.toHaveBeenCalled();
  });

  it('keeps provider configuration details private and offers a manual fallback', async () => {
    mocks.generateContentDraft.mockResolvedValue({ available: false, reason: 'authentication_failed' });

    const response = await POST(request({ surface: 'business_profile', name: 'Rasa Malaysia Kitchen' }), { params: Promise.resolve({ vendorId: 'vendor-1' }) });

    expect(response.status).toBe(503);
    const body = await response.json();
    expect(body.error).toMatchObject({ code: 'AI_UNAVAILABLE' });
    expect(body.error.message).toContain('manually');
    expect(body.error.message).not.toMatch(/token|key|authentication/i);
  });

  it('explains when personal content was withheld from AI', async () => {
    mocks.generateContentDraft.mockResolvedValue({ available: false, reason: 'sensitive_input' });

    const response = await POST(request({ surface: 'business_profile', name: 'Rasa Malaysia Kitchen' }), { params: Promise.resolve({ vendorId: 'vendor-1' }) });

    expect(response.status).toBe(422);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: 'AI_PERSONAL_DATA_WITHHELD', message: expect.stringContaining('write the content manually') },
    });
  });

  it('accepts seeded outlet ids that are not RFC 4122 UUIDs', async () => {
    const seededOutletId = '7a17248b-58e9-2e16-9ad5-3d42176a4263';
    mocks.authorizeOutlet.mockResolvedValue({ ...ownerAccess, access: { ...ownerAccess.access, serviceDb: outletDb({ name: 'Jalan Burma', city: null, state: null, hotel_about: null, amenity_codes: null }) } });
    mocks.generateContentDraft.mockResolvedValue({ available: true, provider: 'gemini', model: 'test', draft: { title: 'T', body: 'B' } });
    const response = await POST(request({ surface: 'outlet_page', outletId: seededOutletId }), { params: Promise.resolve({ vendorId: 'vendor-1' }) });
    expect(response.status).toBe(200);
    expect(mocks.authorizeOutlet).toHaveBeenCalledWith('vendor-1', seededOutletId, ['outlet_manager']);
  });
});
