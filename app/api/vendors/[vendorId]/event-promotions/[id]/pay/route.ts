import { NextResponse } from 'next/server';
import { apiFail, apiOk } from '@/lib/validation/schemas';
import { authorizeVendor } from '@/lib/vendor-authorization';
import { computeEventPromotionAmountSen, payEventPromotionFromWallet } from '@/lib/vendor/event-promotions';
import { getEventPromotionCostPerDaySen } from '@/lib/admin/event-promotions';
import { stripe } from '@/lib/stripe';
import { expireCheckoutFailure, expirePendingPromotionCheckout, recordPendingPromotionCheckout } from '@/lib/vendor/event-promotion-checkout';

interface Props { params: Promise<{ vendorId: string; id: string }> }

/**
 * Pay for an approved event promotion. Wallet earnings first; only on
 * insufficient_earnings does this fall back to a Stripe Checkout session for
 * the full amount (not a split payment) — per the confirmed payment order.
 */
export async function POST(request: Request, { params }: Props) {
  const { vendorId, id } = await params;
  const access = await authorizeVendor(vendorId);
  if (!access.ok) return access.response;

  // An earlier Checkout tab must not stay payable once the vendor pays again
  // (wallet or a fresh Checkout); otherwise the fee could be charged twice.
  const expired = await expirePendingPromotionCheckout(access.access.serviceDb, vendorId, id);
  if (!expired.ok) {
    const failure = expireCheckoutFailure(expired.reason);
    return apiFail(failure.code, failure.message, failure.status);
  }

  const walletResult = await payEventPromotionFromWallet(access.access.authDb, id);
  if (walletResult.ok) {
    return apiOk({ paid: true, method: 'wallet', amountSen: walletResult.amountSen });
  }

  if (walletResult.code === 'not_found') return apiFail('NOT_FOUND', 'Event promotion not found', 404);
  if (walletResult.code === 'not_payable') return apiFail('INVALID_STATE', 'This promotion is not awaiting payment', 409);
  if (walletResult.code === 'forbidden') return apiFail('FORBIDDEN', 'You do not have access to this event promotion', 403);
  if (walletResult.code === 'wallet_not_found') return apiFail('WALLET_NOT_FOUND', 'No wallet found for your account', 404);
  if (walletResult.code !== 'insufficient_earnings') return apiFail('DB_ERROR', 'Failed to process payment', 500);

  // Insufficient wallet earnings — fall back to Stripe Checkout for the full amount.
  const { data: promotion, error: promotionError } = await access.access.serviceDb
    .from('vendor_event_promotions')
    .select('id,title,starts_on,ends_on,status')
    .eq('id', id)
    .eq('vendor_id', vendorId)
    .maybeSingle();
  if (promotionError) return apiFail('DB_ERROR', promotionError.message, 500);
  if (!promotion) return apiFail('NOT_FOUND', 'Event promotion not found', 404);
  if (promotion.status !== 'approved') return apiFail('INVALID_STATE', 'This promotion is not awaiting payment', 409);

  const costPerDaySen = await getEventPromotionCostPerDaySen(access.access.serviceDb);
  const amountSen = computeEventPromotionAmountSen(promotion.starts_on, promotion.ends_on, costPerDaySen);

  const { data: userRow, error: userErr } = await access.access.authDb
    .from('users')
    .select('email, full_name, stripe_customer_id')
    .eq('id', access.access.userId)
    .single();
  if (userErr || !userRow) return apiFail('DB_ERROR', 'Unable to load your account for checkout', 500);

  let customerId: string = (userRow as { stripe_customer_id?: string | null }).stripe_customer_id ?? '';
  if (!customerId) {
    const customer = await stripe.customers.create({
      email: (userRow as { email?: string | null }).email ?? undefined,
      name: (userRow as { full_name?: string | null }).full_name ?? undefined,
      metadata: { supabase_user_id: access.access.userId },
    });
    customerId = customer.id;
    await access.access.serviceDb.from('users').update({ stripe_customer_id: customerId }).eq('id', access.access.userId);
  }

  const origin = request.headers.get('origin') ?? 'http://localhost:3000';
  const session = await stripe.checkout.sessions.create({
    customer: customerId,
    mode: 'payment',
    payment_method_types: ['card'],
    line_items: [{
      price_data: {
        currency: 'myr',
        unit_amount: amountSen,
        product_data: { name: `Event promotion fee — ${promotion.title}` },
      },
      quantity: 1,
    }],
    metadata: { user_id: access.access.userId, payment_kind: 'event_promotion', promotion_id: id },
    success_url: `${origin}/vendor/event-promotions?payment=success`,
    cancel_url: `${origin}/vendor/event-promotions`,
  });

  // Only the recorded session may mark the promotion paid; the webhook refunds any other.
  const recorded = await recordPendingPromotionCheckout(access.access.serviceDb, vendorId, id, session.id, amountSen);
  if (!recorded.ok) {
    await stripe.checkout.sessions.expire(session.id).catch(() => undefined);
    return recorded.reason === 'not_payable'
      ? apiFail('INVALID_STATE', 'This promotion is not awaiting payment', 409)
      : apiFail('DB_ERROR', 'Could not start the card payment', 500);
  }

  return NextResponse.json({ data: { paid: false, method: 'stripe', checkoutUrl: session.url }, error: null });
}
