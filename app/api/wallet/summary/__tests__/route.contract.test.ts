import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync(new URL('../route.ts', import.meta.url), 'utf8');
const capabilitySource = readFileSync(new URL('../../../../../lib/wallet/customer-capabilities.ts', import.meta.url), 'utf8');

describe('wallet summary readiness contract', () => {
  it('derives customer capabilities from owner-scoped wallet, profile, and destination data', () => {
    expect(source).toContain('deriveCustomerWalletCapabilities');
    expect(source).toContain(".eq('user_id', user.id)");
    expect(source).toContain(".eq('id', user.id)");
    expect(source).toContain('...capabilities');
    expect(capabilitySource).toContain('canWithdraw');
    expect(capabilitySource).toContain('blockerCode');
    expect(capabilitySource).toContain('nextAction');
    expect(capabilitySource).toContain('destinationSummary');
    expect(capabilitySource).toContain('lastProviderCheckAt');
    expect(source).not.toContain('provider_reference');
  });

  it('binds readiness to the requested owner-scoped destination and preserves Stripe fallback', () => {
    expect(source).toContain("searchParams.get('destinationId')");
    expect(source).toContain(".eq('id', destinationId)");
    expect(source).toContain('stripeFallback: destinationId === null');
    expect(source).not.toContain(".order('is_default'");
  });
});
