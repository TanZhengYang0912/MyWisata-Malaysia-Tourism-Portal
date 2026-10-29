import type Stripe from 'stripe';
import { payoutFeeSen } from '@/lib/payouts/fees';
import { createTngDirectCreditProvider } from '@/lib/payouts/providers/tng-direct-credit';
import { createServiceClient } from '@/lib/supabase/service';
import { stripe } from '@/lib/stripe';
import { apiFail } from '@/lib/validation/schemas';

type ExecutionInput = {
  withdrawalId: string;
  userId: string;
  amountRm: number;
};

type ExecutionSuccess = {
  ok: true;
  data: {
    status: 'processing';
    provider: 'stripe_connect' | 'tng_direct_credit';
    transfer_id?: string;
    payout_id?: string;
    callbackJobId?: string;
    callbackAvailableAt?: string;
  };
};

type ExecutionFailure = {
  ok: false;
  response: Response;
};

type FailureInput = {
  code: string;
  message: string;
  status: number;
  category?: 'invalid_destination' | 'account_disabled' | 'provider_rejected' | 'timeout' | 'not_configured' | 'unknown';
  retryable: boolean;
};

export type PayoutExecutionResult = ExecutionSuccess | ExecutionFailure;

/**
 * Starts a provider payout after governance has already moved the request to
 * `approved`. The provider idempotency keys make this safe to call from both
 * the initial approval route and the explicit retry route.
 */
export async function executeApprovedWithdrawalPayout({
  withdrawalId,
  userId: _userId,
  amountRm,
}: ExecutionInput): Promise<PayoutExecutionResult> {
  const db = createServiceClient();
  const { data: withdrawalRow } = await db
      .from('withdrawal_requests')
      .select('status, payout_provider, destination_provider_reference, payout_provider_event_id, stripe_transfer_id, stripe_payout_id, updated_at')
      .eq('id', withdrawalId)
      .single();

  const row = withdrawalRow as {
    status: string;
    payout_provider: string | null;
    destination_provider_reference: string | null;
    payout_provider_event_id: string | null;
    stripe_transfer_id: string | null;
    stripe_payout_id: string | null;
    updated_at: string;
  } | null;

  if (!row) {
    return { ok: false, response: apiFail('NOT_FOUND', 'Withdrawal not found', 404) };
  }
  if (row.status !== 'approved') {
    return { ok: false, response: apiFail('INVALID_STATE', 'Only an approved withdrawal can start payout processing', 409) };
  }

  const amountSen = Math.round(amountRm * 100);
  const idempotencyBase = `wr-${withdrawalId}`;
  const providerName = row.payout_provider === 'tng_direct_credit' ? 'tng_direct_credit' : 'stripe_connect';
  const persistFailure = async (input: FailureInput): Promise<ExecutionFailure> => {
    const { error } = await db.rpc('record_withdrawal_execution_failure', {
      p_withdrawal_id: withdrawalId,
      p_provider: providerName,
      p_failure_code: input.code,
      p_failure_message: input.message,
      p_failure_category: input.category ?? 'unknown',
      p_retryable: input.retryable,
    });
    if (error) console.error('[payout-execution] record execution failure:', error);
    if (error) {
      return {
        ok: false,
        response: apiFail(
          'RECONCILIATION_LOCKED',
          'The payout result could not be recorded safely. Do not retry; reconcile the provider transaction first.',
          503,
          { retryable: false },
        ),
      };
    }
    return { ok: false, response: apiFail(input.code, input.message, input.status, { retryable: input.retryable }) } as ExecutionFailure;
  };
  const { data: attemptData, error: attemptError } = await db.rpc('start_withdrawal_payout_attempt', {
    p_withdrawal_id: withdrawalId,
  });
  if (attemptError) {
    console.error('[payout-execution] start withdrawal payout attempt:', attemptError);
    // A transport failure can hide a committed claim or eligibility hold.
    // Do not run a failure mutation that could undo its reserve protection.
    return { ok: false, response: apiFail('PAYOUT_ATTEMPT_STATE_FAILED', 'Payout claim could not be confirmed. Reserved funds are retained; refresh and review the request before retrying.', 503, { retryable: false }) };
  }
  const attempt = attemptData as { acquired?: boolean; started_at?: string; requires_review?: boolean } | null;
  if (attempt?.requires_review === true) {
    return { ok: false, response: apiFail(
      'WITHDRAWAL_REQUIRES_REVIEW',
      'Withdrawal paused for eligibility and destination review. Reserved funds are retained; review the held request before resuming.',
      409, { retryable: false },
    ) };
  }
  if (attempt?.acquired !== true) {
    return {
      ok: false,
      response: apiFail(
        'PAYOUT_EXECUTION_IN_PROGRESS',
        'Another payout attempt is already in progress. Refresh the page before taking another action.',
        409,
        { retryable: false },
      ),
    };
  }
  const attemptStartedAt = attempt?.started_at ?? row.updated_at;

  if (row.payout_provider === 'tng_direct_credit') {
    const provider = createTngDirectCreditProvider();
    if (!provider.isConfigured()) {
      return persistFailure({ code: 'PAYOUT_PROVIDER_UNAVAILABLE', message: 'TNG payouts are unavailable right now. Enable the configured provider, then retry this approved withdrawal.', status: 503, category: 'not_configured', retryable: true });
    }
    if (!row.destination_provider_reference) {
      return persistFailure({ code: 'PAYOUT_DESTINATION_MISSING', message: 'The verified TNG destination is missing. Ask the customer to add a verified destination before continuing.', status: 422, category: 'invalid_destination', retryable: true });
    }

    let providerPayoutId = row.payout_provider_event_id;
    if (!providerPayoutId) {
      let payoutResult;
      try {
        payoutResult = await provider.createPayout({
          withdrawalId,
          amountSen,
          providerReference: row.destination_provider_reference,
          idempotencyKey: `${idempotencyBase}-tng`,
        });
      } catch (error) {
        console.error('[payout-execution] TNG mock payout error:', error);
        return persistFailure({ code: 'TNG_PAYOUT_RESULT_UNKNOWN', message: 'TNG did not return a definitive payout result. Do not retry; reconcile the provider transaction first.', status: 502, category: 'timeout', retryable: false });
      }

      if (payoutResult.status !== 'processing' || !payoutResult.providerEventId) {
        console.error('[payout-execution] TNG mock returned no processing payout ID:', payoutResult.failure);
        const failure = payoutResult.failure;
        return persistFailure({
          code: failure?.code ?? 'TNG_PAYOUT_FAILED',
          message: 'TNG did not accept this payout. Review the destination and provider status before trying again.',
          status: 502,
          category: failure?.category ?? 'provider_rejected',
          retryable: failure?.retryable ?? false,
        });
      }
      providerPayoutId = payoutResult.providerEventId;
    }

    const callbackAvailableAt = new Date(Date.now() + 3_000).toISOString();
    const { data: startData, error: processingError } = await db.rpc('start_tng_mock_payout', {
      p_withdrawal_id: withdrawalId,
      p_provider_payout_id: providerPayoutId,
      p_available_at: callbackAvailableAt,
      p_outcome: 'paid',
    });
    const callback = startData as { outbox_id?: string; available_at?: string } | null;
    if (processingError || !callback?.outbox_id || !callback.available_at) {
      console.error('[payout-execution] start_tng_mock_payout:', processingError ? 'database_error' : 'invalid_result');
      return persistFailure({ code: 'PROCESSING_STATE_FAILED', message: 'TNG created the payout, but MYLawatan could not record it. Do not retry; reconcile the provider payout first.', status: 502, retryable: false });
    }

    const { error: clearFailureError } = await db.rpc('clear_withdrawal_execution_failure', {
      p_withdrawal_id: withdrawalId,
    });
    if (clearFailureError) console.error('[payout-execution] clear execution failure:', clearFailureError);

    return {
      ok: true,
      data: {
        status: 'processing',
        provider: 'tng_direct_credit',
        callbackJobId: callback.outbox_id,
        callbackAvailableAt: callback.available_at,
      },
    };
  }

  // The claim checked this immutable request destination against the current
  // account. Never pay a separately prefetched, potentially changed account.
  const connectAccountId = row.destination_provider_reference;
  if (!connectAccountId) {
    return persistFailure({ code: 'PAYOUT_ACCOUNT_MISSING', message: 'The customer has not completed Stripe Connect onboarding. Ask them to finish payout setup, then retry.', status: 422, category: 'invalid_destination', retryable: true });
  }

  if (!row.stripe_payout_id) {
    const msSinceApproval = Date.now() - new Date(attemptStartedAt).getTime();
    if (msSinceApproval > 24 * 3_600_000) {
      return persistFailure({ code: 'IDEMPOTENCY_WINDOW_EXPIRED', message: 'More than 24 hours have passed without a recorded Stripe payout. Do not retry; reconcile this withdrawal in Stripe Dashboard first.', status: 409, retryable: false });
    }
  }

  if (!row.stripe_payout_id) {
    try {
      const account = await stripe.accounts.retrieve(connectAccountId);
      if (!account.payouts_enabled) {
        return persistFailure({ code: 'PAYOUTS_DISABLED', message: 'Stripe payouts are disabled for this customer. Ask them to complete the required Stripe action, then retry.', status: 422, category: 'account_disabled', retryable: true });
      }
    } catch (error) {
      console.error('[payout-execution] Stripe account retrieve error:', error);
      return persistFailure({ code: 'STRIPE_UNAVAILABLE', message: 'Stripe account status could not be checked. Confirm Stripe is available, then retry.', status: 502, category: 'timeout', retryable: true });
    }
  }

  let transfer: Stripe.Transfer;
  try {
    if (row.stripe_transfer_id) {
      transfer = await stripe.transfers.retrieve(row.stripe_transfer_id);
    } else {
      transfer = await stripe.transfers.create(
        { amount: amountSen, currency: 'myr', destination: connectAccountId, metadata: { withdrawal_id: withdrawalId } },
        { idempotencyKey: `${idempotencyBase}-transfer` },
      );
      const { error } = await db.rpc('record_stripe_transfer', {
        p_withdrawal_id: withdrawalId,
        p_transfer_id: transfer.id,
      });
      if (error) {
        console.error('[payout-execution] record_stripe_transfer:', error);
      return persistFailure({ code: 'TRANSFER_STATE_FAILED', message: 'Stripe created the transfer, but MYLawatan could not record it. Do not retry; reconcile the Stripe transfer first.', status: 502, retryable: false });
      }
    }
  } catch (error) {
    console.error('[payout-execution] Stripe transfer error:', error);
    return persistFailure({ code: 'STRIPE_TRANSFER_RESULT_UNKNOWN', message: 'Stripe did not return a definitive transfer result. Do not retry; reconcile the Stripe transfer first.', status: 502, category: 'timeout', retryable: false });
  }

  let payout: Stripe.Payout;
  try {
    if (row.stripe_payout_id) {
      payout = await stripe.payouts.retrieve(row.stripe_payout_id, undefined, { stripeAccount: connectAccountId });
    } else {
      payout = await stripe.payouts.create(
        { amount: amountSen, currency: 'myr', metadata: { withdrawal_id: withdrawalId } },
        { stripeAccount: connectAccountId, idempotencyKey: `${idempotencyBase}-payout` },
      );
      const { error } = await db.rpc('record_stripe_payout', {
        p_withdrawal_id: withdrawalId,
        p_payout_id: payout.id,
      });
      if (error) {
        console.error('[payout-execution] record_stripe_payout:', error);
      return persistFailure({ code: 'PAYOUT_STATE_FAILED', message: 'Stripe created the payout, but MYLawatan could not record its reference. Do not retry; reconcile the Stripe payout first.', status: 502, retryable: false });
      }
    }
  } catch (error) {
    console.error('[payout-execution] Stripe payout error:', error);
    return persistFailure({ code: 'STRIPE_PAYOUT_RESULT_UNKNOWN', message: 'Stripe did not return a definitive payout result. Do not retry; reconcile the Stripe payout first.', status: 502, category: 'timeout', retryable: false });
  }

  const { error: feeError } = await db.rpc('record_withdrawal_payout_fee', {
    p_withdrawal_id: withdrawalId,
    p_fee_sen: payoutFeeSen(payout),
  });
  if (feeError) {
    console.error('[payout-execution] record_withdrawal_payout_fee:', feeError);
    return persistFailure({ code: 'PAYOUT_FEE_STATE_FAILED', message: 'The Stripe payout reference is safely recorded, but its fee was not saved. Retry to resume database finalization; Stripe will not create another payout.', status: 502, retryable: true });
  }

  const { error: processingError } = await db.rpc('mark_withdrawal_processing', {
    p_withdrawal_id: withdrawalId,
    p_transfer_id: transfer.id,
    p_payout_id: payout.id,
  });
  if (processingError) {
    console.error('[payout-execution] mark_withdrawal_processing:', processingError);
    return persistFailure({ code: 'PROCESSING_STATE_FAILED', message: 'The Stripe payout reference is safely recorded, but the withdrawal status was not updated. Retry to resume database finalization; Stripe will not create another payout.', status: 502, retryable: true });
  }

  const { error: clearFailureError } = await db.rpc('clear_withdrawal_execution_failure', {
    p_withdrawal_id: withdrawalId,
  });
  if (clearFailureError) console.error('[payout-execution] clear execution failure:', clearFailureError);

  return {
    ok: true,
    data: { status: 'processing', provider: 'stripe_connect', transfer_id: transfer.id, payout_id: payout.id },
  };
}
