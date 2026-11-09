export type QueueAvailability = 'available' | 'forbidden' | 'unavailable';

export type QueueCount = {
  availability: QueueAvailability;
  count: number | null;
};

export type WithdrawalQueueSummary = QueueCount & {
  amount: number | null;
  overdueCount: number | null;
  dualApprovalCount: number | null;
  oldestCreatedAt: string | null;
  activity: Array<{ day: string; count: number }> | null;
};

export type AdminDashboardSummary = {
  asOf: string;
  queues: {
    vendors: QueueCount;
    kyc: QueueCount;
    withdrawals: WithdrawalQueueSummary;
    recommendations: QueueCount;
    support: QueueCount;
  };
};

export function queueCount(availability: QueueAvailability, count: number | null): QueueCount {
  return availability === 'available'
    ? { availability, count: Number.isSafeInteger(count) && count !== null && count >= 0 ? count : null }
    : { availability, count: null };
}

export function isUsableQueueCount(value: QueueCount): value is QueueCount & { count: number } {
  return value.availability === 'available' && value.count !== null;
}

export function totalAvailableQueueItems(queues: ReadonlyArray<QueueCount>): number {
  return queues.reduce((total, queue) => total + (isUsableQueueCount(queue) ? queue.count : 0), 0);
}
