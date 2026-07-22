import { describe, expect, it } from 'vitest';
import { createTngDirectCreditProvider, maskTngReference } from '../providers/tng-direct-credit';

describe('TNG Direct Credit provider boundary', () => {
  it('stays unavailable until production provider configuration exists', () => {
    const provider = createTngDirectCreditProvider({});

    expect(provider.isConfigured()).toBe(false);
    expect(provider.name).toBe('tng_direct_credit');
  });

  it('masks a TNG identifier without exposing the full value', () => {
    expect(maskTngReference('+60123456789')).toBe('+60••••6789');
    expect(maskTngReference('123456789012')).toBe('••••9012');
  });

  it('accepts only an identifier and never a PIN in the destination contract', () => {
    const provider = createTngDirectCreditProvider({});

    expect(provider.verifyDestination({ phoneOrDuitNow: '+60123456789' })).resolves.toMatchObject({
      status: 'rejected',
      reason: 'provider_not_configured',
    });
  });
});
