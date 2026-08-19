import type { WithdrawalRiskLevel } from './withdrawal-risk';

export type { WithdrawalRiskLevel };

export type WithdrawalApprovalState =
  | 'pending'
  | 'pending_second_approval'
  | 'approved';

export type WithdrawalReviewDecision =
  | 'approve'
  | 'hold'
  | 'reject'
  | 'fraud_override';

export type WithdrawalReviewDetail = {
  id: string;
  userId: string;
  amountSen: number;
  status: string;
  requiresDualApproval: boolean;
  approvalCount: number;
  riskLevel: WithdrawalRiskLevel;
  riskOverridden: boolean;
  customer: {
    displayName: string;
    email: string;
    kycStatus: string;
    kycApprovedAt: string | null;
  };
  wallet: {
    topupSen: number;
    earningsSen: number;
    pendingEarningsSen: number;
    reservedSen: number;
    withdrawnSen: number;
  };
  destinationLabel: string;
  createdAt: string;
  customerReason: string | null;
  approvals: Array<{
    actorId: string;
    actorLabel: string;
    action: string;
    note: string | null;
    createdAt: string;
  }>;
  riskSnapshot: Record<string, unknown>;
  reviewSources: WithdrawalReviewSources;
  payoutFailure: {
    provider: string | null;
    eventId: string | null;
    code: string | null;
    message: string | null;
    category: string | null;
    occurredAt: string | null;
    retryable: boolean | null;
  };
  payoutExecution: {
    locked: boolean;
    claimedAt: string | null;
  };
};

export type WithdrawalReviewLedgerRow = {
  id: string;
  type: string;
  amountSen: number;
  direction: string;
  bucket: string;
  referenceId: string | null;
  orderId: string | null;
  withdrawalId?: string | null;
  createdAt: string;
  note: string | null;
};

export type WithdrawalReviewSources = {
  rewardSources: WithdrawalReviewLedgerRow[];
  affiliateSources: WithdrawalReviewLedgerRow[];
  walletTransactions: WithdrawalReviewLedgerRow[];
  fraudFlags: unknown[];
};

export type WithdrawalListItem = {
  id: string;
  userId: string;
  customerDisplayName: string;
  amountSen: number;
  status: string;
  requiresDualApproval: boolean;
  approvalCount: number;
  riskLevel: WithdrawalRiskLevel | null;
  riskOverridden: boolean;
  createdAt: string;
  updatedAt: string;
};

export type WithdrawalListResponse = {
  items: WithdrawalListItem[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
};
