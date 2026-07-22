import { beforeEach, describe, expect, it, vi } from 'vitest';

const getUser = vi.fn();

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({ auth: { getUser }, rpc: vi.fn() }),
}));
vi.mock('@/lib/supabase/service', () => ({ createServiceClient: vi.fn() }));
vi.mock('@/lib/kyc/ocr', () => ({ runKycOcr: vi.fn() }));

const { POST } = await import('../route');

describe('POST /api/kyc/upload', () => {
  beforeEach(() => getUser.mockReset());

  it('requires explicit consent before sending KYC images to Gemini OCR', async () => {
    getUser.mockResolvedValue({ data: { user: { id: '11111111-1111-4111-8111-111111111111' } } });
    const form = new FormData();

    const response = await POST(new Request('http://localhost/api/kyc/upload', { method: 'POST', body: form }));

    expect(response.status).toBe(422);
    await expect(response.json()).resolves.toMatchObject({ error: { code: 'OCR_CONSENT_REQUIRED' } });
  });
});
