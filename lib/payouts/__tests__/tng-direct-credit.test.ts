import { describe, expect, it } from 'vitest';
import { createTngDirectCreditProvider, maskTngReference } from '../providers/tng-direct-credit';

describe('TNG Direct Credit provider boundary', () => {
  it('stays unavailable until production provider configuration exists', () => {
    const provider = createTngDirectCreditProvider({ mode: '', nodeEnv: 'test', webhookSecret: '' });

    expect(provider.isConfigured()).toBe(false);
    expect(provider.name).toBe('tng_direct_credit');
  });

  it('masks a TNG identifier without exposing the full value', () => {
    expect(maskTngReference('+60123456789')).toBe('+60••••6789');
    expect(maskTngReference('123456789012')).toBe('••••9012');
  });

  it('accepts only an identifier and never a PIN in the destination contract', () => {
    const provider = createTngDirectCreditProvider({ mode: '', nodeEnv: 'test', webhookSecret: '' });

    expect(provider.verifyDestination({ phoneOrDuitNow: '+60123456789' })).resolves.toMatchObject({
      status: 'rejected',
      reason: 'provider_not_configured',
    });
  });

  it('enables the built-in mock only outside production with a webhook secret', () => {
    expect(createTngDirectCreditProvider({
      mode: 'mock',
      nodeEnv: 'test',
      webhookSecret: 'test-secret',
    }).isConfigured()).toBe(true);

    expect(createTngDirectCreditProvider({
      mode: 'mock',
      nodeEnv: 'production',
      webhookSecret: 'test-secret',
    }).isConfigured()).toBe(false);

    expect(createTngDirectCreditProvider({
      mode: 'mock',
      nodeEnv: 'test',
      webhookSecret: '',
    }).isConfigured()).toBe(false);
  });

  it('keeps an injected live adapter disabled until live settlement is implemented', () => {
    const provider = createTngDirectCreditProvider({
      merchantId: 'merchant',
      apiKey: 'api-key',
      nodeEnv: 'production',
      verifyDestination: async () => ({ status: 'verified', providerReference: 'live-ref', reason: null }),
      createPayout: async () => ({ status: 'processing', providerEventId: 'live-payout', failure: null }),
    });

    expect(provider.isConfigured()).toBe(false);
    expect(provider.verifyDestination({ phoneOrDuitNow: '+60123456789' })).resolves.toMatchObject({
      status: 'rejected',
      reason: 'provider_not_configured',
    });
  });

  it('creates an opaque destination reference without retaining the raw identifier', async () => {
    const rawIdentifier = '+60123456789';
    const provider = createTngDirectCreditProvider({
      mode: 'mock',
      nodeEnv: 'test',
      webhookSecret: 'test-secret',
    });

    const result = await provider.verifyDestination({ phoneOrDuitNow: rawIdentifier });

    expect(result).toMatchObject({
      status: 'verified',
      maskedReference: '+60••••6789',
      reason: null,
    });
    expect(result.providerReference).toMatch(/^tng_dest_[0-9a-f]{32}$/);
    expect(JSON.stringify(result)).not.toContain(rawIdentifier);
  });

  it('creates a deterministic opaque payout id for the same idempotency key', async () => {
    const provider = createTngDirectCreditProvider({
      mode: 'mock',
      nodeEnv: 'test',
      webhookSecret: 'test-secret',
    });
    const input = {
      withdrawalId: '9e703f42-7f40-4a4f-a4a0-447eb6319931',
      amountSen: 2500,
      providerReference: 'tng_dest_aabbccddeeff00112233445566778899',
      idempotencyKey: 'withdrawal:9e703f42-7f40-4a4f-a4a0-447eb6319931',
    };

    const first = await provider.createPayout(input);
    const second = await provider.createPayout(input);

    expect(first).toEqual(second);
    expect(first).toMatchObject({ status: 'processing', failure: null });
    expect(first.providerEventId).toMatch(/^tng_payout_[0-9a-f]{32}$/);
    expect(JSON.stringify(first)).not.toContain(input.providerReference);
  });
});
