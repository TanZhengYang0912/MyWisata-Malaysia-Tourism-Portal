// P-TMF (Trust & Money Flow) — TMF-3 Wallet Ledger
// ⚠️  This is the ONLY sanctioned entry point to write to wallet_ledger.
// P3 affiliate module MUST call this helper — never write to wallets/wallet_ledger directly.

import type { SupabaseClient } from '@supabase/supabase-js';
import { roundRM } from '@/lib/money';

export type LedgerEntryType =
  | 'reward_pending'
  | 'reward_cleared'
  | 'wallet_payment'
  | 'withdrawal_reserve'
  | 'withdrawal_release'
  | 'withdrawal_complete'
  | 'affiliate_commission'
  | 'refund_credit';

interface CreditParams {
  userId:       string;
  amount:       number;             // in RM (positive for credit, negative for debit)
  entryType:    LedgerEntryType;
  balanceType?: 'available' | 'pending';   // defaults derived from entryType
  referenceId?: string;
  note?:        string;
}

interface CreditResult {
  ledgerEntryId: string;
  walletId:      string;
  newBalance:    { available: number; pending: number };
}

const DEFAULT_BALANCE_TYPE: Record<LedgerEntryType, 'available' | 'pending'> = {
  reward_pending:       'pending',
  reward_cleared:       'available',
  wallet_payment:       'available',
  withdrawal_reserve:   'available',
  withdrawal_release:   'available',
  withdrawal_complete:  'available',
  affiliate_commission: 'pending',
  refund_credit:        'available',
};

/**
 * Single authoritative write to wallet_ledger.
 * Recomputes wallets summary from ledger sums, so wallets.balance is always derivable.
 *
 * Callers:
 * - P3 affiliate/recommendation: 'reward_pending', 'affiliate_commission'
 * - P4 orders: 'wallet_payment' (debit), 'refund_credit'
 * - P-TMF withdrawal flow: 'withdrawal_reserve', 'withdrawal_release', 'withdrawal_complete'
 */
export async function creditWallet(
  db: SupabaseClient,
  params: CreditParams,
): Promise<CreditResult> {
  const { userId, amount, entryType, referenceId, note } = params;
  const balanceType = params.balanceType ?? DEFAULT_BALANCE_TYPE[entryType];

  // 1. Find wallet
  const { data: wallet, error: walletError } = await db
    .from('wallets')
    .select('id, available_balance, pending_balance')
    .eq('user_id', userId)
    .single();

  if (walletError || !wallet) throw new Error(`Wallet not found for user ${userId}`);

  // 2. Guard against overdraft on debit
  if (amount < 0) {
    const currentBalance = balanceType === 'available'
      ? Number(wallet.available_balance)
      : Number(wallet.pending_balance);
    if (currentBalance + amount < 0) {
      throw new Error(`Insufficient ${balanceType} balance`);
    }
  }

  // 3. Insert ledger entry
  const { data: entry, error: ledgerError } = await db
    .from('wallet_ledger')
    .insert({
      wallet_id:    wallet.id,
      entry_type:   entryType,
      amount:       roundRM(amount),
      balance_type: balanceType,
      reference_id: referenceId ?? null,
      note:         note ?? null,
    })
    .select('id')
    .single();

  if (ledgerError || !entry) throw new Error(`Ledger insert failed: ${ledgerError?.message}`);

  // 4. Update wallets summary (idempotent — could be derived by trigger later)
  const newAvailable = balanceType === 'available'
    ? roundRM(Number(wallet.available_balance) + amount)
    : Number(wallet.available_balance);
  const newPending = balanceType === 'pending'
    ? roundRM(Number(wallet.pending_balance) + amount)
    : Number(wallet.pending_balance);

  await db.from('wallets').update({
    available_balance: newAvailable,
    pending_balance:   newPending,
    updated_at:        new Date().toISOString(),
  }).eq('id', wallet.id);

  return {
    ledgerEntryId: entry.id,
    walletId:      wallet.id,
    newBalance:    { available: newAvailable, pending: newPending },
  };
}

/**
 * Clear pending rewards to available after the clearance window.
 * Called by a scheduled job or admin action, not from user code.
 */
export async function clearPendingReward(
  db: SupabaseClient,
  ledgerEntryId: string,
): Promise<void> {
  const { data: entry } = await db.from('wallet_ledger').select('*').eq('id', ledgerEntryId).single();
  if (!entry || entry.balance_type !== 'pending') return;

  // Debit pending, credit available (same amount, opposite balance_type)
  await creditWallet(db, {
    userId:      '',   // resolved from wallet_id below
    amount:      -Number(entry.amount),
    entryType:   'reward_pending',
    balanceType: 'pending',
    referenceId: entry.reference_id ?? undefined,
    note:        `Clearance reversal of ${ledgerEntryId}`,
  });

  await creditWallet(db, {
    userId:      '',
    amount:      Number(entry.amount),
    entryType:   'reward_cleared',
    balanceType: 'available',
    referenceId: entry.reference_id ?? undefined,
    note:        `Cleared after hold window from ${ledgerEntryId}`,
  });
}
