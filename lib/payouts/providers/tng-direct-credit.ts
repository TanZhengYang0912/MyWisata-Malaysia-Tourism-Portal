import type { PayoutProvider, PayoutResult, ProviderFailure } from '../providers';

export type TngDirectCreditConfig = {
  merchantId?: string;
  apiKey?: string;
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
  const config: Required<Pick<TngDirectCreditConfig, 'merchantId' | 'apiKey'>> & Pick<TngDirectCreditConfig, 'verifyDestination' | 'createPayout'> = {
    merchantId: overrides.merchantId ?? process.env.TNG_DIRECT_CREDIT_MERCHANT_ID ?? '',
    apiKey: overrides.apiKey ?? process.env.TNG_DIRECT_CREDIT_API_KEY ?? '',
    verifyDestination: overrides.verifyDestination,
    createPayout: overrides.createPayout,
  };

  return {
    name: 'tng_direct_credit',
    destinationType: 'e_wallet',
    isConfigured: () => Boolean(config.merchantId && config.apiKey && config.verifyDestination && config.createPayout),
    async verifyDestination(input) {
      const maskedReference = maskTngReference(input.phoneOrDuitNow);
      if (!config.merchantId || !config.apiKey || !config.verifyDestination || !config.createPayout) {
        return { status: 'rejected', providerReference: null, maskedReference, reason: 'provider_not_configured' };
      }
      const result = await config.verifyDestination(input);
      return { ...result, maskedReference };
    },
    async createPayout(input) {
      if (!config.merchantId || !config.apiKey || !config.verifyDestination || !config.createPayout) {
        return { status: 'failed', providerEventId: null, failure: notConfiguredFailure() };
      }
      return config.createPayout(input);
    },
  };
}
