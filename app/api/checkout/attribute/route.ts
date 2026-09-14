// P4 — Member 4: wires affiliate attribution into REAL checkout.
// CLAUDE-CHECKOUT-WIRE.md — CASE B (client-side createOrder), variant B2.
//
// Why B2, not B1: app/customer/checkout/page.tsx is "use client" and imports
// backend/domains/commerce.ts::createOrder() directly. That module has no
// "use server" boundary, so it — and everything it imports — is bundled into
// the browser. lib/affiliate/attribution.ts::onOrderPaid() imports next/headers's
// cookies(), which is guarded by the `server-only` package and throws a
// build-time error the moment it's reachable from a client bundle. Inlining
// the onOrderPaid() call inside createOrder() (CASE B1's literal instructions)
// would not compile for this codebase. This route is the smallest fix that
// actually works: ZERO changes to commerce.ts, one new server-side endpoint,
// one small non-blocking client-side call after order creation.
//
// Does not re-derive anything the client claims — takes only orderId as
// input, confirms it belongs to the caller, then reads mw_ref itself
// server-side (the real httpOnly cookie, not anything the client could
// forge) before validating it against affiliate_clicks.

import { cookies } from 'next/headers';
import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';
import { parseBody, apiOk, apiFail } from '@/lib/validation/schemas';
import { attributeCheckoutSchema } from '@/lib/validation/affiliate-schemas';
import { onOrderPaid } from '@/lib/affiliate/attribution';
import { attributeRecommendationReward } from '@/lib/recommendations/reward-attribution';
import { settleOrderVendorEarnings } from '@/lib/vendor/settlement';
import { enqueueUserTransactionEmail } from '@/lib/email/events';
import { formatMYR } from '@/lib/i18n/format';

export async function POST(request: Request) {
  const authClient = await createClient();
  const { data: { user } } = await authClient.auth.getUser();
  if (!user) return apiFail('UNAUTHORIZED', 'Sign in required', 401);

  const parsed = await parseBody(request, attributeCheckoutSchema);
  if (!parsed.ok) return parsed.response;
  const { orderId } = parsed.data;

  const service = createServiceClient();

  // Ownership check: don't let user A attribute (or probe the existence of) user B's order.
  const { data: order } = await service.from('orders').select('id,user_id').eq('id', orderId).maybeSingle();
  if (!order || order.user_id !== user.id) return apiFail('NOT_FOUND', 'Order not found', 404);

  try {
    const cookieStore = await cookies();
    const mwRefCookie = cookieStore.get('mw_ref')?.value ?? null;
    if (mwRefCookie) {
      // Validate against affiliate_clicks so a stale/forged cookie degrades to
      // null instead of violating orders.affiliate_click_id's FK.
      const { data: click } = await service.from('affiliate_clicks').select('id').eq('id', mwRefCookie).maybeSingle();
      if (click) {
        await service.from('orders').update({ affiliate_click_id: click.id }).eq('id', orderId);
      }
    }
  } catch (error) {
    // Attribution must never block checkout — this route already runs after
    // the order is paid, but still fail soft and let onOrderPaid() run
    // (it will just find no click id and return early).
    console.error('[checkout/attribute] cookie/click lookup failed', error instanceof Error ? error.message : error);
  }

  await onOrderPaid(orderId); // idempotent (UNIQUE(order_id)); never throws
  await settleOrderVendorEarnings(service, orderId); // idempotent (order_settlements unique key); never throws
  try {
    const reward = await attributeRecommendationReward(service, orderId);
    if (reward.kind === 'created') {
      const deliveries = reward.rewards.flatMap(({ commissionId, recommenderId, amountSen }) => {
        const amountRm = amountSen / 100;
        return [
          service.from('notifications').insert({ user_id: recommenderId, type: 'recommendation_reward_pending', title: 'Your recommendation earned a pending reward', body: `${formatMYR(amountRm)} will be available after the 7-day hold and KYC approval.`, link: '/customer/wallet' }),
          enqueueUserTransactionEmail({ userId: recommenderId, eventType: 'recommendation_reward_pending', eventKey: `recommendation_reward_pending:${commissionId}`, reference: 'Recommendation reward', amountRm }),
        ];
      });
      const results = await Promise.allSettled(deliveries);
      for (const result of results) if (result.status === 'rejected') console.error('[checkout/attribute] recommendation reward notification failed', result.reason);
    }
  } catch (error) {
    // The checkout is already paid; reward attribution failures must not
    // misrepresent that payment as failed. The order can be reconciled safely.
    console.error('[checkout/attribute] recommendation reward attribution failed', error);
  }

  return apiOk({ attributed: true });
}
