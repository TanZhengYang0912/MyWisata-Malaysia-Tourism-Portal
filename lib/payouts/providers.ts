import type { PayoutDestinationType } from './destinations';

export type PayoutProviderName = 'stripe_connect' | 'tng_direct_credit';

export type ProviderFailure = {
  code: string | null;
  message: string | null;
  category: 'invalid_destination' | 'account_disabled' | 'provider_rejected' | 'timeout' | 'not_configured' | 'unknown';
  retryable: boolean;
};

export type DestinationVerification = {
  status: 'verified' | 'pending' | 'rejected';
  providerReference: string | null;
  maskedReference: string;
  reason: string | null;
};

export type PayoutResult = {
  status: 'processing' | 'completed' | 'failed';
  providerEventId: string | null;
  failure: ProviderFailure | null;
};

export type PayoutProvider = {
  name: PayoutProviderName;
  destinationType: PayoutDestinationType;
  isConfigured(): boolean;
  verifyDestination(input: { phoneOrDuitNow: string }): Promise<DestinationVerification>;
  createPayout(input: {
    withdrawalId: string;
    amountSen: number;
    providerReference: string;
    idempotencyKey: string;
  }): Promise<PayoutResult>;
};
