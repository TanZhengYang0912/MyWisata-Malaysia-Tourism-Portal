export type WithdrawalDisplayItem = { status: string; amount: number };

export const WITHDRAWAL_REVIEW_STATUSES = [
  'pending', 'pending_second_approval', 'hold', 'overdue',
] as const;

const IN_PROGRESS_STATUSES = new Set([
  'pending', 'pending_second_approval', 'approved', 'processing', 'hold', 'overdue',
]);

const REVIEW_STATUSES = new Set<string>(WITHDRAWAL_REVIEW_STATUSES);

export function isWithdrawalReviewableStatus(status: string) {
  return REVIEW_STATUSES.has(status);
}

export function getWithdrawalDisplayGroups<T extends WithdrawalDisplayItem>(items: T[], earnings: number) {
  const pending = items.filter((item) => IN_PROGRESS_STATUSES.has(item.status));
  const history = items.filter((item) => !IN_PROGRESS_STATUSES.has(item.status));
  return {
    pending,
    history,
    pendingTotal: pending.reduce((sum, item) => sum + item.amount, 0),
    // The submit RPC already moves Earnings into Reserved. Never subtract the
    // same request again in the browser.
    availableEarnings: Math.max(0, earnings),
  };
}
