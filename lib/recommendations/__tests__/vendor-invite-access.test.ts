import { describe, expect, it, vi } from 'vitest';
import { hashRecommendationInviteToken } from '@/lib/recommendations/invite-token';
import { resolveActiveVendorInvite } from '@/lib/recommendations/vendor-invite-access';

function makeService(row: Record<string, unknown> | null, error: unknown = null) {
  const maybeSingle = vi.fn().mockResolvedValue({ data: row, error });
  const eq = vi.fn().mockReturnValue({ maybeSingle });
  const select = vi.fn().mockReturnValue({ eq });
  return { from: vi.fn().mockReturnValue({ select }), select };
}

describe('resolveActiveVendorInvite', () => {
  it('returns only the recommendation id and normalized bound email for an active invite', async () => {
    const service = makeService({
      id: 'invite-1',
      token_hash: 'stored-token-hash',
      recommendation_id: 'rec-1',
      email: ' Owner@Example.com ',
      status: 'invited',
      expires_at: '2099-01-01T00:00:00.000Z',
    });

    const result = await resolveActiveVendorInvite(service as never, 'valid-invite-token-value');

    expect(result).toEqual({
      ok: true,
      invite: { recommendationId: 'rec-1', email: 'owner@example.com' },
    });
    expect(JSON.stringify(result)).not.toContain('invite-1');
    expect(JSON.stringify(result)).not.toContain('stored-token-hash');
    expect(service.select).toHaveBeenCalledWith('recommendation_id,email,status,expires_at');
    expect(service.from).toHaveBeenCalledWith('vendor_recommendation_invites');
  });

  it.each([
    ['cancelled', 'INVITE_CANCELLED'],
    ['claimed', 'INVITE_ALREADY_CLAIMED'],
  ])('maps %s to %s without returning the row', async (status, code) => {
    const service = makeService({
      id: 'invite-1',
      token_hash: 'stored-token-hash',
      recommendation_id: 'rec-1',
      email: 'owner@example.com',
      status,
      expires_at: '2099-01-01T00:00:00.000Z',
    });

    const result = await resolveActiveVendorInvite(service as never, 'valid-invite-token-value');

    expect(result).toMatchObject({ ok: false, error: { code } });
    expect(JSON.stringify(result)).not.toContain('invite-1');
    expect(JSON.stringify(result)).not.toContain('stored-token-hash');
  });

  it('maps missing invite data to the stable invalid response', async () => {
    const service = makeService(null);

    await expect(resolveActiveVendorInvite(service as never, 'valid-invite-token-value')).resolves.toEqual({
      ok: false,
      error: { code: 'INVITE_INVALID', message: 'This invitation link is invalid.', status: 404 },
    });
  });

  it('maps an expired invited invitation to the stable expired response', async () => {
    const service = makeService({
      recommendation_id: 'rec-1',
      email: 'owner@example.com',
      status: 'invited',
      expires_at: '2000-01-01T00:00:00.000Z',
    });

    await expect(resolveActiveVendorInvite(service as never, 'valid-invite-token-value')).resolves.toEqual({
      ok: false,
      error: { code: 'INVITE_EXPIRED', message: 'This vendor invitation has expired.', status: 409 },
    });
  });

  it('hashes the supplied token before querying the invitation', async () => {
    const token = 'valid-invite-token-value';
    const service = makeService(null);

    await resolveActiveVendorInvite(service as never, token);

    expect(service.select).toHaveBeenCalledTimes(1);
    const query = service.select.mock.results[0]?.value;
    expect(query.eq).toHaveBeenCalledWith('token_hash', hashRecommendationInviteToken(token));
  });
});
