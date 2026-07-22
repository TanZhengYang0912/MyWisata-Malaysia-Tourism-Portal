export type WalletBucket = 'topup' | 'earnings' | 'pending_earnings' | 'reserved_earnings';

export type WalletAllocation = {
  topupSen: number;
  earningsSen: number;
};

export const ACTIVE_WITHDRAWAL_STATUSES = [
  'pending',
  'pending_second_approval',
  'approved',
  'processing',
  'hold',
  'overdue',
] as const;

export type ActiveWithdrawalStatus = (typeof ACTIVE_WITHDRAWAL_STATUSES)[number];
