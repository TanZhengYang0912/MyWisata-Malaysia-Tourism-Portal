import { beforeEach, describe, expect, it, vi } from 'vitest';

const rpc = vi.fn();
const db = { rpc };
const reviewer = { id: '22222222-2222-4222-8222-222222222222' };

vi.mock('@/lib/kyc/reviewer-auth', () => ({
  requireKycReviewer: async () => ({ db, user: reviewer, response: null }),
}));

const { GET, POST } = await import('../route');

describe('/api/admin/kyc/identity-resolutions', () => {
  beforeEach(() => rpc.mockReset());

  it('returns only the safe resolution reference on creation', async () => {
    rpc.mockResolvedValue({ data: {
      id: '33333333-3333-4333-8333-333333333333', status: 'open', version: 1,
      affected_keys: [{ key: 'a'.repeat(64) }], proposal_digest: 'b'.repeat(64),
    }, error: null });
    const response = await POST(new Request('http://localhost/api/admin/kyc/identity-resolutions', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ submissionId: '44444444-4444-4444-8444-444444444444', kind: 'legacy_conflict', reasonCode: 'legacy_resolution' }),
    }));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.data).toEqual({ id: '33333333-3333-4333-8333-333333333333', status: 'open', version: 1 });
    expect(JSON.stringify(body)).not.toContain('a'.repeat(64));
    expect(JSON.stringify(body)).not.toContain('proposal_digest');
  });

  it('rejects external ticket URLs before database access', async () => {
    const response = await POST(new Request('http://localhost/api/admin/kyc/identity-resolutions', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ submissionId: '44444444-4444-4444-8444-444444444444', kind: 'legacy_conflict', reasonCode: 'legacy_resolution', supportTicketRef: 'https://example.test/123' }),
    }));
    expect(response.status).toBe(422);
    expect(rpc).not.toHaveBeenCalled();
  });

  it('returns only resolutions explicitly associated with the current reviewer', async () => {
    rpc.mockResolvedValue({ data: {
      id: '33333333-3333-4333-8333-333333333333', kind: 'legacy_conflict', status: 'second_review', version: 2,
      caseId: '44444444-4444-4444-8444-444444444444', primary: false, secondary: true,
      primaryConfirmed: true, secondaryConfirmed: false, canApply: false,
      affected_keys: [{ key: 'c'.repeat(64) }], primary_confirmation_id: 'secret', storage_path: '/private/id.png',
    }, error: null });
    const response = await GET(new Request('http://localhost/api/admin/kyc/identity-resolutions?submissionId=44444444-4444-4444-8444-444444444444'));
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body.data).toEqual({
      id: '33333333-3333-4333-8333-333333333333', kind: 'legacy_conflict', status: 'second_review', version: 2,
      caseId: '44444444-4444-4444-8444-444444444444', primary: false, secondary: true,
      primaryConfirmed: true, secondaryConfirmed: false, canApply: false,
    });
    expect(JSON.stringify(body)).not.toMatch(/affected_keys|confirmation_id|storage_path|c{64}/);
  });
});
