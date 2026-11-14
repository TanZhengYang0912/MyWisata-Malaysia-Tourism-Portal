import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  authorizeVendor: vi.fn(),
  generateListingSuggestion: vi.fn(),
}));

vi.mock('@/lib/vendor-authorization', () => ({ authorizeVendor: mocks.authorizeVendor }));
vi.mock('@/lib/ai/listing-suggestions', () => ({ generateListingSuggestion: mocks.generateListingSuggestion }));

import { POST } from '../route';

// Seeded ids are not RFC 4122 UUIDs (version nibble 2); the route must accept them.
const OUTLET_ID = '7a17248b-58e9-2e16-9ad5-3d42176a4263';
const OTHER_OUTLET_ID = '22222222-2222-4222-8222-222222222222';

// Minimal chainable query stub: every builder call returns itself, awaiting resolves the row(s).
function queryResult(result: { data: unknown; error: null }) {
  const builder: Record<string, unknown> = {};
  for (const method of ['select', 'eq', 'order', 'limit']) builder[method] = vi.fn(() => builder);
  builder.maybeSingle = vi.fn(async () => result);
  builder.then = (resolve: (value: unknown) => unknown) => Promise.resolve(result).then(resolve);
  return builder;
}

function serviceDb() {
  return {
    from: vi.fn((table: string) => table === 'outlets'
      ? queryResult({ data: { id: OUTLET_ID, name: 'Hotel Puri', city: 'Melaka', state: 'Melaka' }, error: null })
      : queryResult({ data: [{ name: 'Accommodation' }, { name: 'Food' }], error: null })),
  };
}

const ownerAccess = {
  ok: true,
  access: {
    userId: 'owner-1',
    vendorId: 'vendor-1',
    role: 'vendor_owner',
    outletIds: [],
    isOwner: true,
    isOutletManager: false,
    serviceDb: serviceDb(),
    authDb: {},
  },
} as const;

function managerAccess() {
  return {
    ok: true,
    access: {
      userId: 'manager-1',
      vendorId: 'vendor-1',
      role: 'outlet_manager',
      outletIds: [OUTLET_ID],
      isOwner: false,
      isOutletManager: true,
      serviceDb: serviceDb(),
      authDb: {},
    },
  } as const;
}

function suggestionRequest(body: Record<string, unknown>) {
  return new Request('http://localhost/api/vendors/vendor-1/products/suggestions', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
  });
}

describe('POST /api/vendors/[vendorId]/products/suggestions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.authorizeVendor.mockResolvedValue(ownerAccess);
  });

  it('keeps provider configuration details private and offers a manual fallback', async () => {
    mocks.generateListingSuggestion.mockResolvedValue({ available: false, reason: 'authentication_failed' });

    const response = await POST(
      new Request('http://localhost/api/vendors/vendor-1/products/suggestions', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name: 'Nyonya Kuih', productType: 'food' }),
      }),
      { params: Promise.resolve({ vendorId: 'vendor-1' }) },
    );

    expect(response.status).toBe(503);
    const body = await response.json();
    expect(body.error).toMatchObject({ code: 'AI_UNAVAILABLE' });
    expect(body.error.message).toContain('manually');
    expect(body.error.message).not.toMatch(/token|key|authentication/i);
  });

  it('explains when personal listing content was withheld from AI', async () => {
    mocks.generateListingSuggestion.mockResolvedValue({ available: false, reason: 'sensitive_input' });

    const response = await POST(
      new Request('http://localhost/api/vendors/vendor-1/products/suggestions', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name: 'Nyonya Kuih', productType: 'food' }),
      }),
      { params: Promise.resolve({ vendorId: 'vendor-1' }) },
    );

    expect(response.status).toBe(422);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: 'AI_SENSITIVE_INPUT', message: expect.stringContaining('write the listing manually') },
    });
  });

  it('lets an assigned outlet manager use the assistant with the outlet resolved on the server', async () => {
    mocks.authorizeVendor.mockResolvedValue(managerAccess());
    mocks.generateListingSuggestion.mockResolvedValue({
      available: true, provider: 'gemini', model: 'test',
      suggestion: { title: 'Deluxe Room', description: 'A quiet room.', category: 'Accommodation', tags: ['heritage'] },
    });

    const response = await POST(
      suggestionRequest({ name: 'Deluxe Room', productType: 'service', location: 'Somewhere else', outletId: OUTLET_ID }),
      { params: Promise.resolve({ vendorId: 'vendor-1' }) },
    );

    expect(response.status).toBe(200);
    // Default roles (owner + outlet manager), not owner-only.
    expect(mocks.authorizeVendor).toHaveBeenCalledWith('vendor-1');
    expect(mocks.generateListingSuggestion).toHaveBeenCalledWith(expect.objectContaining({
      outletName: 'Hotel Puri',
      location: 'Melaka, Melaka',
      allowedCategories: ['Accommodation', 'Food'],
    }));
  });

  it('rejects an outlet outside the caller scope before calling AI', async () => {
    mocks.authorizeVendor.mockResolvedValue(managerAccess());

    const response = await POST(
      suggestionRequest({ name: 'Deluxe Room', productType: 'service', outletId: OTHER_OUTLET_ID }),
      { params: Promise.resolve({ vendorId: 'vendor-1' }) },
    );

    expect(response.status).toBe(403);
    expect(mocks.generateListingSuggestion).not.toHaveBeenCalled();
  });

  it('returns the authorization failure for a caller with no vendor access', async () => {
    mocks.authorizeVendor.mockResolvedValue({ ok: false, response: Response.json({ error: { code: 'FORBIDDEN' } }, { status: 403 }) });

    const response = await POST(
      suggestionRequest({ name: 'Deluxe Room', productType: 'service' }),
      { params: Promise.resolve({ vendorId: 'vendor-1' }) },
    );

    expect(response.status).toBe(403);
    expect(mocks.generateListingSuggestion).not.toHaveBeenCalled();
  });
});
