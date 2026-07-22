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
});
