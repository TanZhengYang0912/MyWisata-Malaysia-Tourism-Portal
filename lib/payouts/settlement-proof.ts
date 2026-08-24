import type { WithdrawalStatus } from '@/lib/constants';

export type SettlementProof = {
  state: WithdrawalStatus;
  provider: 'tng_direct_credit' | 'stripe_connect';
  providerPayoutReference: string | null;
  event: null | {
    id: string;
    status: 'paid' | 'failed';
    amountSen: number;
    currency: 'MYR';
    providerOccurredAt: string;
    receivedAt: string;
    signatureVerified: boolean;
    verificationMethod: 'hmac_sha256' | 'legacy_unverified' | 'unverified';
    ingestionSource: 'tng_mock_webhook' | 'migration_backfill' | 'unknown';
    payloadSha256: string | null;
  };
  moneyMovement: {
    amountSen: number;
    from: 'reserved_earnings';
    to: 'withdrawn_earnings' | 'earnings' | null;
  };
  ledger: Array<{
    id: string;
    type: 'withdrawal_reserve' | 'withdrawal_complete' | 'withdrawal_cancel';
    direction: 'debit' | 'credit';
    amountSen: number;
    createdAt: string;
  }>;
  delivery: null | {
    status: 'pending' | 'processing' | 'delivered' | 'exhausted';
    attempts: number;
    deliveredAt: string | null;
    lastErrorCode: string | null;
    needsReconciliation: boolean;
  };
  notification: null | {
    eventType: 'withdrawal_paid' | 'withdrawal_failed';
    emailStatus: 'pending' | 'sending' | 'sent' | 'failed';
    queuedAt: string;
    sentAt: string | null;
  };
};

export type CustomerSettlementProof = Omit<SettlementProof, 'delivery' | 'notification'>;
export type AdminSettlementProof = SettlementProof;

export function customerSettlementProof(proof: SettlementProof): CustomerSettlementProof {
  const { delivery: _delivery, notification: _notification, ...safe } = proof;
  return safe;
}
