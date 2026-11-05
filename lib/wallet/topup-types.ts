export type WalletTopUpStatus =
  | { state: 'open'; operationId: string; amountSen: number; checkoutUrl: string }
  | { state: 'checking' | 'paid_pending_credit' | 'credited' | 'expired' | 'cancelled' | 'failed'; operationId: string; amountSen: number };

export function isWalletTopUpPending(status: WalletTopUpStatus | null): boolean {
  return status?.state === 'checking' || status?.state === 'paid_pending_credit';
}
