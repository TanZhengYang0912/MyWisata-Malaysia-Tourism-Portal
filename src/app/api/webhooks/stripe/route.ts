// Stripe webhook receiver — verifies signature and dispatches events to RPCs.
//
// Endpoints Stripe events we care about:
//   - transfer.paid       → complete_payout (customer notified, ledger debited)
//   - transfer.failed     → fail_payout (funds released, request rejected)
//   - transfer.reversed   → treat like failed (reversed by admin)
//
// Local dev requires Stripe CLI running:
//   stripe listen --forward-to localhost:3000/api/webhooks/stripe
// The CLI prints the signing secret which you paste into STRIPE_WEBHOOK_SECRET.

import { createClient as createServiceClient } from '@supabase/supabase-js';
import { verifyWebhook } from '@/lib/stripe';
import type Stripe from 'stripe';

// Force Node runtime — Stripe SDK not edge-compatible
export const runtime = 'nodejs';

function serviceDb() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  return createServiceClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

export async function POST(request: Request) {
  const signature = request.headers.get('stripe-signature');
  if (!signature) {
    return Response.json({ error: 'missing signature' }, { status: 400 });
  }

  const rawBody = await request.text();
  let event: Stripe.Event;
  try {
    event = verifyWebhook(rawBody, signature);
  } catch (err) {
    console.error('[stripe webhook] signature verification failed', err);
    return Response.json({ error: 'invalid signature' }, { status: 400 });
  }

  const db = serviceDb();

  try {
    switch (event.type) {
      case 'transfer.paid':
      case 'transfer.updated': {
        const transfer = event.data.object as Stripe.Transfer;
        // Only complete when the transfer is truly settled
        if (event.type === 'transfer.updated' && !transfer.reversed) break;
        if (transfer.reversed) {
          await db.rpc('fail_payout', {
            p_gateway_ref: transfer.id,
            p_reason:      'Transfer reversed at Stripe',
          });
        } else {
          await db.rpc('complete_payout', { p_gateway_ref: transfer.id });
        }
        break;
      }
      case 'transfer.failed' as unknown as Stripe.Event['type']: {
        const transfer = event.data.object as Stripe.Transfer;
        await db.rpc('fail_payout', {
          p_gateway_ref: transfer.id,
          p_reason:      'Stripe transfer failed',
        });
        break;
      }
      case 'transfer.reversed' as unknown as Stripe.Event['type']: {
        const transfer = event.data.object as Stripe.Transfer;
        await db.rpc('fail_payout', {
          p_gateway_ref: transfer.id,
          p_reason:      'Transfer reversed at Stripe',
        });
        break;
      }
      default:
        // Unrelated event — acknowledge so Stripe stops retrying
        console.log('[stripe webhook] ignoring event type', event.type);
    }

    return Response.json({ received: true }, { status: 200 });
  } catch (err) {
    console.error('[stripe webhook] handler error', err);
    // Return 500 so Stripe retries (they retry with exponential backoff for up to 3 days)
    return Response.json({ error: 'handler failed' }, { status: 500 });
  }
}
