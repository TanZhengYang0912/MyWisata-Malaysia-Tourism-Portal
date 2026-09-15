import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import { signWalletModerationCredential, verifyWalletModerationCredential } from '../moderation-credential';

const originalSecret = process.env.WALLET_MODERATION_REVIEW_SECRET;
const secret = 'test-secret-that-is-at-least-32-bytes-long';
const nowSeconds = 1_789_206_000;
const input = {
  actorId: '11111111-1111-4111-8111-111111111111',
  withdrawalId: '22222222-2222-4222-8222-222222222222',
  action: 'reject' as const,
  reasonCategory: 'bank_details_mismatch',
  reason: 'The payout details could not be verified.',
  verdict: 'advisory' as const,
};

describe('withdrawal moderation credential', () => {
  beforeEach(() => {
    process.env.WALLET_MODERATION_REVIEW_SECRET = secret;
  });

  afterEach(() => {
    if (originalSecret === undefined) delete process.env.WALLET_MODERATION_REVIEW_SECRET;
    else process.env.WALLET_MODERATION_REVIEW_SECRET = originalSecret;
  });

  it('binds an opaque five-minute credential to the review claims', () => {
    const token = signWalletModerationCredential(input, secret, nowSeconds);
    expect(token).toMatch(/^v1\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);
    expect(token).not.toContain(input.reason);
    expect(verifyWalletModerationCredential(token, input, secret, nowSeconds + 60)).toMatchObject({
      valid: true,
      claims: { version: 1, action: 'reject', verdict: 'advisory', issuedAt: nowSeconds, expiresAt: nowSeconds + 300 },
    });
  });

  it.each([
    ['actor', { actorId: '33333333-3333-4333-8333-333333333333' }],
    ['withdrawal', { withdrawalId: '44444444-4444-4444-8444-444444444444' }],
    ['category', { reasonCategory: 'other' }],
    ['reason', { reason: 'A different rejection reason entirely.' }],
  ])('rejects a changed %s', (_label, change) => {
    const token = signWalletModerationCredential(input, secret, nowSeconds);
    expect(verifyWalletModerationCredential(token, { ...input, ...change }, secret, nowSeconds + 60))
      .toEqual({ valid: false, reason: 'mismatch' });
  });

  it('rejects altered signatures, malformed tokens, future issuance, and expiry', () => {
    const token = signWalletModerationCredential(input, secret, nowSeconds);
    const altered = `${token.slice(0, -1)}${token.endsWith('a') ? 'b' : 'a'}`;
    expect(verifyWalletModerationCredential(altered, input, secret, nowSeconds)).toEqual({ valid: false, reason: 'signature' });
    expect(verifyWalletModerationCredential('not-a-token', input, secret, nowSeconds)).toEqual({ valid: false, reason: 'malformed' });
    expect(verifyWalletModerationCredential(token, input, secret, nowSeconds + 300)).toEqual({ valid: false, reason: 'expired' });

    const futureToken = signWalletModerationCredential(input, secret, nowSeconds + 1);
    expect(verifyWalletModerationCredential(futureToken, input, secret, nowSeconds)).toEqual({ valid: false, reason: 'claims' });
  });

  it.each([undefined, 'too-short'])('fails closed for a missing or weak signing secret', (configuredSecret) => {
    if (configuredSecret === undefined) delete process.env.WALLET_MODERATION_REVIEW_SECRET;
    else process.env.WALLET_MODERATION_REVIEW_SECRET = configuredSecret;
    expect(() => signWalletModerationCredential(input)).toThrow('wallet_moderation_secret_invalid');
  });
});
