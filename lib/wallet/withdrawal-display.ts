export type WithdrawalDisplayItem = { status: string; amount: number };

const IN_PROGRESS_STATUSES = new Set([
  'pending', 'pending_second_approval', 'approved', 'processing', 'hold', 'overdue',
]);

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
