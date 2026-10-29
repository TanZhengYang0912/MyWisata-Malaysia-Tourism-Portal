import type { WithdrawalRiskLevel } from './withdrawal-risk';
import type { AdminSettlementProof } from '@/lib/payouts/settlement-proof';
import type { WithdrawalAvailableAction } from './withdrawal-capabilities';

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
  authorizationVersion?: string;
  id: string;
  userId: string;
  amountSen: number;
  status: string;
  requiresDualApproval: boolean;
  approvalCycle: number;
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
    approvalCycle: number | null;
    note: string | null;
    createdAt: string;
  }>;
  riskSnapshot: Record<string, unknown>;
  reviewSources: WithdrawalReviewSources;
  reviewSourcesStatus: 'ready' | 'unavailable';
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
  settlementProof: AdminSettlementProof | null;
  availableActions: WithdrawalAvailableAction[];
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
  approvalCycle: number;
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

export function countCurrentCycleApprovals(
  approvals: ReadonlyArray<{ approver_id?: unknown; action?: unknown; approval_cycle?: unknown }>,
  currentCycle: number | null,
): number {
  if (currentCycle === null) return 0;
  return new Set(approvals
    .filter((approval) => approval.action === 'approve' && approval.approval_cycle === currentCycle)
    .map((approval) => approval.approver_id)
    .filter((approverId): approverId is string => typeof approverId === 'string'))
    .size;
}
