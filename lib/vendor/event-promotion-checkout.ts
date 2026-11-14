import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { stripe } from '@/lib/stripe';

/**
 * Event promotion Stripe Checkout lifecycle
 * (docs/plans/2026-11-14-1530-event-promotion-checkout-refund-safety.md).
 *
 * A promotion has at most one open Checkout session, recorded in
 * vendor_event_promotions.pending_checkout_session_id. Before anything else
 * can settle or change the fee (wallet payment, a new Checkout, a resubmit)
 * that session is expired on Stripe, so the vendor cannot pay twice.
 * If Stripe reports the session already completed, the caller must stop:
 * the webhook is about to confirm (or refund) that payment.
 */
export type ExpireCheckoutResult =
  | { ok: true }
  | { ok: false; reason: 'completed' | 'stripe_error' | 'db_error' };

type PendingRow = { pending_checkout_session_id: string | null };

export async function expirePendingPromotionCheckout(
  serviceDb: SupabaseClient,
  vendorId: string,
  promotionId: string,
): Promise<ExpireCheckoutResult> {
  const { data, error } = await serviceDb
    .from('vendor_event_promotions')
    .select('pending_checkout_session_id')
    .eq('id', promotionId)
    .eq('vendor_id', vendorId)
    .maybeSingle();
  if (error) return { ok: false, reason: 'db_error' };
  const sessionId = (data as PendingRow | null)?.pending_checkout_session_id;
  if (!sessionId) return { ok: true };

  try {
    const session = await stripe.checkout.sessions.retrieve(sessionId);
    if (session.status === 'complete') return { ok: false, reason: 'completed' };
    if (session.status === 'open') await stripe.checkout.sessions.expire(sessionId);
  } catch {
    // Expire fails when the session completed between retrieve and expire; re-check before giving up.
    try {
      const session = await stripe.checkout.sessions.retrieve(sessionId);
      if (session.status === 'complete') return { ok: false, reason: 'completed' };
      if (session.status !== 'expired') return { ok: false, reason: 'stripe_error' };
    } catch {
      return { ok: false, reason: 'stripe_error' };
    }
  }

  // Clear only the session we just expired, so a concurrent new Checkout is not erased.
  const { error: clearError } = await serviceDb
    .from('vendor_event_promotions')
    .update({ pending_checkout_session_id: null, pending_checkout_amount_sen: null })
    .eq('id', promotionId)
    .eq('vendor_id', vendorId)
    .eq('pending_checkout_session_id', sessionId);
  if (clearError) return { ok: false, reason: 'db_error' };
  return { ok: true };
}

/** Records the new open session. Returns false when the promotion is no longer awaiting payment. */
export async function recordPendingPromotionCheckout(
  serviceDb: SupabaseClient,
  vendorId: string,
  promotionId: string,
  sessionId: string,
  amountSen: number,
): Promise<{ ok: true } | { ok: false; reason: 'not_payable' | 'db_error' }> {
  const { data, error } = await serviceDb
    .from('vendor_event_promotions')
    .update({ pending_checkout_session_id: sessionId, pending_checkout_amount_sen: amountSen })
    .eq('id', promotionId)
    .eq('vendor_id', vendorId)
    .eq('status', 'approved')
    .select('id');
  if (error) return { ok: false, reason: 'db_error' };
  if (!data?.length) return { ok: false, reason: 'not_payable' };
  return { ok: true };
}

/** Maps a failed expiry to the API error the vendor sees. */
export function expireCheckoutFailure(reason: 'completed' | 'stripe_error' | 'db_error') {
  if (reason === 'completed') {
    return { code: 'PAYMENT_IN_PROGRESS', message: 'A card payment for this promotion is being confirmed. Refresh in a moment.', status: 409 } as const;
  }
  if (reason === 'stripe_error') {
    return { code: 'PAYMENT_PROVIDER_UNAVAILABLE', message: 'Could not reach the payment provider. Please try again.', status: 503 } as const;
  }
  return { code: 'DB_ERROR', message: 'Could not check the open payment for this promotion.', status: 500 } as const;
}
