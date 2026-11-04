import { createServiceClient } from '@/lib/supabase/service';
import { apiFail, apiOk } from '@/lib/validation/schemas';
import { stripe } from '@/lib/stripe';
import { enqueueUserTransactionEmail } from '@/lib/email/events';
import { getPaymentEmailType } from '@/lib/email/payment';
import { settleReconciledWalletTopUp, type TopUpOperationRow } from '@/lib/wallet/topup-operations';
import type Stripe from 'stripe';

function configuredInteger(name: string, fallback: number, maximum: number): number | null {
  const raw = process.env[name];
  if (raw === undefined) return fallback;
  const value = Number(raw);
  return Number.isSafeInteger(value) && value > 0 && value <= maximum ? value : null;
}

export async function POST(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get('authorization') !== `Bearer ${secret}`) {
    return apiFail('UNAUTHORIZED', 'Unauthorized', 401);
  }
  const batch = configuredInteger('WALLET_TOPUP_RECONCILE_BATCH_SIZE', 5, 100);
  const lease = configuredInteger('WALLET_TOPUP_RECONCILE_LEASE_SECONDS', 300, 1800);
  if (!batch || !lease) return apiFail('RECONCILIATION_DISABLED', 'Top-up reconciliation is not configured', 503);

  const service = createServiceClient();
  const { data, error } = await service.rpc('claim_wallet_topup_reconciliation', {
    p_limit: batch,
    p_lease_seconds: lease,
  });
  if (error || !Array.isArray(data)) return apiFail('RECONCILIATION_UNAVAILABLE', 'Top-up reconciliation could not start', 503);

  let reconciled = 0;
  let failed = 0;
  for (const candidate of data as TopUpOperationRow[]) {
    let nextState: string | null = null;
    try {
      if (candidate.email_state === 'pending' && candidate.state === 'credited') {
        const paymentEmail = getPaymentEmailType('topup');
        await enqueueUserTransactionEmail({
          userId: candidate.owner_user_id,
          eventType: paymentEmail.eventType,
          eventKey: `${paymentEmail.keyPrefix}:${candidate.stripe_session_id}`,
          reference: candidate.stripe_session_id ?? candidate.id,
          amountRm: candidate.amount_sen / 100,
        });
        await service.rpc('mark_wallet_topup_email_queued', {
          p_operation_id: candidate.id,
          p_owner_user_id: candidate.owner_user_id,
        });
      } else if (candidate.stripe_session_id) {
        const session = await stripe.checkout.sessions.retrieve(candidate.stripe_session_id);
        if (matchesOperation(candidate, session) && session.payment_status === 'paid') {
          await settleReconciledWalletTopUp(candidate, session);
          nextState = 'credited';
          const paymentEmail = getPaymentEmailType('topup');
          await enqueueUserTransactionEmail({
            userId: candidate.owner_user_id,
            eventType: paymentEmail.eventType,
            eventKey: `${paymentEmail.keyPrefix}:${session.id}`,
            reference: session.id,
            amountRm: candidate.amount_sen / 100,
          });
          await service.rpc('mark_wallet_topup_email_queued', {
            p_operation_id: candidate.id,
            p_owner_user_id: candidate.owner_user_id,
          });
        } else if (matchesOperation(candidate, session) && session.status === 'expired') {
          nextState = 'expired';
        } else {
          nextState = 'checking';
        }
      } else {
        // An unknown create result is never retried beyond Stripe's idempotency retention window.
        nextState = 'checking';
      }
      reconciled++;
    } catch {
      failed++;
      nextState = 'checking';
    } finally {
      await service.rpc('finish_wallet_topup_reconciliation', {
        p_operation_id: candidate.id,
        p_lease_token: candidate.reconcile_lease_token,
        p_state: nextState,
      });
    }
  }

  if (failed) console.error('wallet_topup_reconciliation_partial_failure', { failed, reconciled });
  return apiOk({ claimed: data.length, reconciled, failed });
}

function matchesOperation(row: TopUpOperationRow, session: Stripe.Checkout.Session): boolean {
  return session.metadata?.payment_kind === 'topup'
    && session.metadata?.user_id === row.owner_user_id
    && session.metadata?.topup_operation_id === row.id
    && session.amount_total === row.amount_sen
    && session.currency?.toUpperCase() === 'MYR'
    && session.livemode === row.is_live;
}
