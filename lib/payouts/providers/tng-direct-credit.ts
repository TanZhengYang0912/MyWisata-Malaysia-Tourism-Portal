import { createHmac } from 'node:crypto';
import type { PayoutProvider, PayoutResult, ProviderFailure } from '../providers';
import { isTngMockPayoutEnabled } from '../tng-config';

export type TngDirectCreditConfig = {
  merchantId?: string;
  apiKey?: string;
  mode?: string;
  nodeEnv?: string;
  webhookSecret?: string;
  verifyDestination?: (input: { phoneOrDuitNow: string }) => Promise<{
    status: 'verified' | 'pending' | 'rejected';
    providerReference: string | null;
    reason: string | null;
  }>;
  createPayout?: (input: {
    withdrawalId: string;
    amountSen: number;
    providerReference: string;
    idempotencyKey: string;
  }) => Promise<PayoutResult>;
};

function opaqueMockReference(prefix: 'tng_dest' | 'tng_payout', value: string, secret: string): string {
  const digest = createHmac('sha256', secret).update(value).digest('hex').slice(0, 32);
  return `${prefix}_${digest}`;
}

export function maskTngReference(value: string): string {
  const normalized = value.trim();
  const prefix = normalized.startsWith('+') && normalized.length > 3 ? normalized.slice(0, 3) : '';
  return `${prefix}••••${normalized.slice(-4)}`;
}

function notConfiguredFailure(): ProviderFailure {
  return {
    code: 'provider_not_configured',
    message: 'TNG Direct Credit is not configured for this environment',
    category: 'not_configured',
    retryable: false,
  };
}

export function createTngDirectCreditProvider(overrides: TngDirectCreditConfig = {}): PayoutProvider {
  const config = {
    merchantId: overrides.merchantId ?? process.env.TNG_DIRECT_CREDIT_MERCHANT_ID ?? '',
    apiKey: overrides.apiKey ?? process.env.TNG_DIRECT_CREDIT_API_KEY ?? '',
    mode: overrides.mode ?? process.env.TNG_PAYOUT_MODE ?? '',
    nodeEnv: overrides.nodeEnv ?? process.env.NODE_ENV ?? '',
    webhookSecret: overrides.webhookSecret ?? process.env.TNG_MOCK_WEBHOOK_SECRET ?? '',
    verifyDestination: overrides.verifyDestination,
    createPayout: overrides.createPayout,
  };
  const mockEnabled = isTngMockPayoutEnabled({
    NODE_ENV: config.nodeEnv,
    TNG_PAYOUT_MODE: config.mode,
    TNG_MOCK_WEBHOOK_SECRET: config.webhookSecret,
  });
  return {
    name: 'tng_direct_credit',
    destinationType: 'e_wallet',
    isConfigured: () => mockEnabled,
    async verifyDestination(input) {
      const maskedReference = maskTngReference(input.phoneOrDuitNow);
      if (mockEnabled) {
        const normalized = input.phoneOrDuitNow.trim();
        return {
          status: 'verified',
          providerReference: opaqueMockReference('tng_dest', normalized, config.webhookSecret),
          maskedReference,
          reason: null,
        };
      }
      if (!mockEnabled) {
        return { status: 'rejected', providerReference: null, maskedReference, reason: 'provider_not_configured' };
      }
      return { status: 'rejected', providerReference: null, maskedReference, reason: 'provider_not_configured' };
    },
    async createPayout(input) {
      if (mockEnabled) {
        return {
          status: 'processing',
          providerEventId: opaqueMockReference(
            'tng_payout',
            `${input.withdrawalId}:${input.idempotencyKey}`,
            config.webhookSecret,
          ),
          failure: null,
        };
      }
      if (!mockEnabled) {
        return { status: 'failed', providerEventId: null, failure: notConfiguredFailure() };
      }
      return { status: 'failed', providerEventId: null, failure: notConfiguredFailure() };
    },
  };
}
