import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  authorizeVendor: vi.fn(),
  generateListingSuggestion: vi.fn(),
}));

vi.mock('@/lib/vendor-authorization', () => ({ authorizeVendor: mocks.authorizeVendor }));
vi.mock('@/lib/ai/listing-suggestions', () => ({ generateListingSuggestion: mocks.generateListingSuggestion }));

import { POST } from '../route';

const ownerAccess = {
  ok: true,
  access: {
    userId: 'owner-1',
    vendorId: 'vendor-1',
    role: 'vendor_owner',
    outletIds: [],
    isOwner: true,
    isOutletManager: false,
    serviceDb: {},
    authDb: {},
  },
} as const;

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
});
