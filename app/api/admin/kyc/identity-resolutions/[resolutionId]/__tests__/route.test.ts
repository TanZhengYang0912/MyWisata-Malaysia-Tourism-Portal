import { beforeEach, describe, expect, it, vi } from 'vitest';

const rpc = vi.fn();
const db = { rpc };
vi.mock('@/lib/kyc/reviewer-auth', () => ({
  requireKycReviewer: async () => ({ db, user: { id: '22222222-2222-4222-8222-222222222222' }, response: null }),
}));
const { GET } = await import('../route');

describe('GET /api/admin/kyc/identity-resolutions/[resolutionId]', () => {
  beforeEach(() => rpc.mockReset());

  it('whitelists resolution status and excludes fingerprints, evidence and proof IDs', async () => {
    rpc.mockResolvedValue({ data: {
      id: '33333333-3333-4333-8333-333333333333', kind: 'ownership_correction', status: 'applied', version: 3,
      caseId: '44444444-4444-4444-8444-444444444444', primary: true, secondary: false,
      primaryConfirmed: true, secondaryConfirmed: true, canApply: false,
      affected_keys: [{ key: 'd'.repeat(64) }], proposal_digest: 'e'.repeat(64), primary_confirmation_id: 'private-proof', storage_path: '/private/front.jpg',
    }, error: null });
    const response = await GET(new Request('http://localhost'), { params: Promise.resolve({ resolutionId: '33333333-3333-4333-8333-333333333333' }) });
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body.data).toEqual({
      id: '33333333-3333-4333-8333-333333333333', kind: 'ownership_correction', status: 'applied', version: 3,
      caseId: '44444444-4444-4444-8444-444444444444', primary: true, secondary: false,
      primaryConfirmed: true, secondaryConfirmed: true, canApply: false,
    });
    expect(JSON.stringify(body)).not.toMatch(/affected_keys|proposal_digest|confirmation_id|storage_path|d{64}|e{64}/);
  });
});
