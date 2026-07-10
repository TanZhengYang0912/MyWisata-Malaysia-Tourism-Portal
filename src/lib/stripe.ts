// Stripe test-mode client — used by Member 3 for withdrawal payouts.
//
// Architecture:
//   1. Admin approves a withdrawal request → status='approved' (funds still reserved)
//   2. System calls `initiatePayout()` which creates a Stripe transfer
//   3. Stripe returns transfer.id → we INSERT payout_transactions row (status='pending')
//   4. Stripe webhook fires `transfer.paid` → we mark withdrawal_requests.status='completed'
//      and debit wallet_ledger
//   5. On `transfer.failed` → release reserved funds back to available balance
//
// For demo: uses hardcoded STRIPE_DEMO_CONNECT_ACCOUNT for all transfers.
// For production: read the customer's `payout_destinations.stripe_account_id`.

import Stripe from 'stripe';
import { roundRM } from '@/lib/money';

// Lazy singleton — Stripe throws in strict env parsing when key is missing at import time
let _client: Stripe | null = null;

export function getStripe(): Stripe {
  if (_client) return _client;
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new StripeConfigError('STRIPE_SECRET_KEY is not set');
  _client = new Stripe(key, {
    apiVersion: '2024-11-20.acacia',
    typescript: true,
  });
  return _client;
}

export class StripeConfigError extends Error {
  constructor(msg: string) { super(`[stripe] ${msg}`); }
}
export class StripePayoutError extends Error {
  constructor(msg: string, public stripeCode?: string) { super(`[stripe] ${msg}`); }
}

interface InitiatePayoutParams {
  amountRM:            number;
  withdrawalRequestId: string;
  recipientUserId:     string;
  /** Optional: use recipient's own Stripe Connect account. Defaults to STRIPE_DEMO_CONNECT_ACCOUNT. */
  destinationAccount?: string;
}

interface PayoutResult {
  transferId: string;
  amountSen:  number;
  status:     Stripe.Transfer.SourceType | string;
  raw:        Stripe.Transfer;
}

/**
 * Initiate a Stripe transfer for a withdrawal payout.
 * Returns { transferId, status } — the caller must persist to payout_transactions.
 *
 * In TEST MODE this is completely free and processes fake money.
 */
export async function initiatePayout(params: InitiatePayoutParams): Promise<PayoutResult> {
  const { amountRM, withdrawalRequestId, recipientUserId } = params;
  const destinationAccount =
    params.destinationAccount ?? process.env.STRIPE_DEMO_CONNECT_ACCOUNT;

  if (!destinationAccount) {
    throw new StripeConfigError(
      'No destination Connect account configured. Set STRIPE_DEMO_CONNECT_ACCOUNT or pass destinationAccount.',
    );
  }

  const amountSen = Math.round(roundRM(amountRM) * 100);
  if (amountSen <= 0) throw new StripePayoutError('Amount must be positive');

  const stripe = getStripe();

  try {
    const transfer = await stripe.transfers.create(
      {
        amount:      amountSen,
        currency:    'myr',
        destination: destinationAccount,
        description: `Withdrawal payout for request ${withdrawalRequestId}`,
        metadata: {
          withdrawal_request_id: withdrawalRequestId,
          recipient_user_id:     recipientUserId,
          environment:           process.env.NODE_ENV ?? 'unknown',
          demo:                  process.env.NEXT_PUBLIC_DEMO_MODE === 'true' ? '1' : '0',
        },
      },
      {
        // Idempotency at the Stripe layer — request_id itself is unique per approval
        idempotencyKey: `payout-${withdrawalRequestId}`,
      },
    );

    return {
      transferId: transfer.id,
      amountSen,
      status:     transfer.reversed ? 'reversed' : 'pending',
      raw:        transfer,
    };
  } catch (err) {
    if (err instanceof Stripe.errors.StripeError) {
      // Common demo problems: currency not supported, destination account missing
      throw new StripePayoutError(
        `Stripe rejected transfer: ${err.message}`,
        err.code,
      );
    }
    throw err;
  }
}

/**
 * Verify a webhook signature. Throws if invalid.
 */
export function verifyWebhook(body: string, signature: string): Stripe.Event {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) throw new StripeConfigError('STRIPE_WEBHOOK_SECRET is not set');
  const stripe = getStripe();
  return stripe.webhooks.constructEvent(body, signature, secret);
}
