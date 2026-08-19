import { describe, expect, it } from 'vitest';
import { normalizeProviderFailure } from '../failures';

describe('normalizeProviderFailure', () => {
  it('classifies invalid Stripe destinations as non-retryable', () => {
    expect(normalizeProviderFailure({ provider: 'stripe_connect', code: 'account_closed', message: 'Destination account is closed' })).toMatchObject({
      category: 'account_disabled',
      retryable: false,
      code: 'account_closed',
    });
  });

  it('classifies timeouts as retryable and redacts secrets', () => {
    const failure = normalizeProviderFailure({ provider: 'tng_direct_credit', code: 'timeout', message: 'secret=do-not-store; request timed out' });

    expect(failure).toMatchObject({ category: 'timeout', retryable: true });
    expect(failure.message).toBe('secret=[redacted]; request timed out');
    expect(failure.message).not.toContain('do-not-store');
  });

  it('uses a safe unknown fallback', () => {
    expect(normalizeProviderFailure({ provider: 'stripe_connect', code: null, message: null })).toMatchObject({
      category: 'unknown',
      retryable: false,
      code: null,
      message: null,
    });
  });

  it('redacts Malaysian local mobile and DuitNow identifiers', () => {
    const failure = normalizeProviderFailure({
      provider: 'tng_direct_credit',
      code: 'recipient_invalid',
      message: 'DuitNow recipient 01158620908 is invalid; contact 017-714 3951',
    });

    expect(failure.message).toBe('DuitNow recipient [redacted] is invalid; contact [redacted]');
    expect(failure.message).not.toMatch(/01158620908|017-714 3951/);
  });
});
