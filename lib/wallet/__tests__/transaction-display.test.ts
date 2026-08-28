import { describe, expect, it } from 'vitest';
import {
  customerVisibleTransactions,
  filterTransactions,
  signedTransactionAmount,
  transactionGroup,
  transactionLabel,
  type TransactionFilter,
} from '@/lib/wallet/transaction-display';

const transactions = [
  { id: 'earnings-1', type: 'earnings', direction: 'credit' as const },
  { id: 'pending-1', type: 'earnings_pending', direction: 'credit' as const },
  { id: 'withdrawal-1', type: 'withdrawal_reserve', direction: 'debit' as const },
];

describe('transaction display helpers', () => {
  it('uses human-readable labels and groups for ledger types', () => {
    expect(transactionLabel('earnings_pending')).toBe('Pending earnings');
    expect(transactionGroup('earnings_pending')).toBe('earnings');
    expect(transactionGroup('withdrawal_reserve')).toBe('withdrawals');
  });

  it('filters earnings and withdrawals without mixing ledger buckets', () => {
    expect(filterTransactions(transactions, 'earnings' as TransactionFilter).map((item) => item.id)).toEqual(['earnings-1', 'pending-1']);
    expect(filterTransactions(transactions, 'withdrawals' as TransactionFilter).map((item) => item.id)).toEqual(['withdrawal-1']);
    expect(filterTransactions(transactions, 'all' as TransactionFilter)).toHaveLength(3);
  });

  it('formats credits with plus and debits with minus', () => {
    expect(signedTransactionAmount({ type: 'topup', direction: 'credit', amount: 50 })).toBe('+RM 50.00');
    expect(signedTransactionAmount({ type: 'spend', direction: 'debit', amount: 12.3 })).toBe('-RM 12.30');
  });

  it('hides withdrawal settlement audit rows without hiding the reserve or return', () => {
    const visible = customerVisibleTransactions([
      { id: 'reserve', type: 'withdrawal_reserve', direction: 'debit', amount: 50 },
      { id: 'complete', type: 'withdrawal_complete', direction: 'debit', amount: 50 },
      { id: 'returned', type: 'withdrawal_cancel', direction: 'credit', amount: 50 },
    ]);

    expect(visible.map((item) => item.id)).toEqual(['reserve', 'returned']);
  });
});
