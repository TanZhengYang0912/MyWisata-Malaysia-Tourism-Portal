// ⚠️ SHARED BOUNDARY — WALLET CREDITING
// Calls the wallet owner's credit_earnings() RPC
// (supabase/migrations/009_stripe_wallet.sql — a teammate's "Complete wallet
// system phase 1" commit) — the shared helper this file's own comment
// originally said to switch to once it existed. Do NOT write to
// wallets.topup_sen/earnings_sen or insert into wallet_transactions directly
// from anywhere else in lib/affiliate/**; call this function instead.
//
// Before that RPC existed, this wrote directly to the old single-bucket
// wallets.pending_balance + wallet_ledger. Those columns are untouched by
// migration 009 (additive only) and still hold whatever was credited before
// this switch — this file no longer touches them going forward.

import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Credits `amountRM` to `userId`'s earnings_sen bucket via credit_earnings()
 * — per that RPC's own doc comment, earnings_sen is "credited from sales /
 * commissions" and is both spendable and withdrawable. `orderId` is passed
 * as p_ref_id for traceability in wallet_transactions.
 *
 * `service` must be the service-role client — this credits a wallet that
 * isn't the current request's caller (the link owner, not the buyer).
 */
export async function creditAffiliateCommission(
  service: SupabaseClient,
  userId: string,
  amountRM: number,
  orderId: string,
): Promise<void> {
  // credit_earnings() looks up the wallet row with FOR UPDATE and throws if
  // none exists. Every real user gets one from the handle_new_auth_user()
  // trigger, but guard anyway rather than let a missing row surface as an
  // opaque RPC exception.
  const { data: wallet } = await service.from('wallets').select('id').eq('user_id', userId).maybeSingle();
  if (!wallet) {
    const { error: createErr } = await service.from('wallets').insert({ user_id: userId });
    if (createErr) throw createErr;
  }

  const amountSen = Math.round(amountRM * 100);
  const { error } = await service.rpc('credit_earnings', {
    p_user_id: userId,
    p_amount_sen: amountSen,
    p_ref_id: orderId,
    p_note: `Affiliate commission for order ${orderId.slice(0, 8)}`,
  });
  if (error) throw error;
}
