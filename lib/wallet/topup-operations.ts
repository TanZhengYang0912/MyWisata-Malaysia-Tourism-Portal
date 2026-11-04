import 'server-only';

import { stripe } from '@/lib/stripe';
import { createServiceClient } from '@/lib/supabase/service';
import { resolvePaymentAppUrl } from '@/lib/payments/app-url';
import type { WalletTopUpStatus } from '@/lib/wallet/topup-types';

type TopUpOperationRow = {
  id: string;
  owner_user_id: string;
  amount_sen: number;
  is_live: boolean;
  state: 'creating' | 'open' | 'checking' | 'paid_pending_credit' | 'credited' | 'expired' | 'cancelled' | 'failed';
  customer_email: string | null;
  customer_name: string | null;
  stripe_customer_id: string | null;
  stripe_customer_idempotency_key: string;
  stripe_session_id: string | null;
  stripe_session_idempotency_key: string;
  checkout_url: string | null;
  success_url: string;
  cancel_url: string;
  session_expires_at: string | null;
  created_at: string;
  email_state: 'not_required' | 'pending' | 'queued';
  reconcile_lease_token: string | null;
  reused?: boolean;
};

export type WalletTopUpResult = WalletTopUpStatus;

const LIVE_IDEMPOTENCY_WINDOW_MS = 23 * 60 * 60 * 1000;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseOperation(value: unknown): TopUpOperationRow | null {
  const row = isRecord(value) && 'data' in value && isRecord(value.data) ? value.data : value;
  if (!isRecord(row)) return null;
  if (typeof row.id !== 'string' || typeof row.owner_user_id !== 'string'
    || typeof row.amount_sen !== 'number' || typeof row.state !== 'string') return null;
  return row as unknown as TopUpOperationRow;
}

function publicResult(row: TopUpOperationRow): WalletTopUpResult {
  if (row.state === 'open' && row.checkout_url && row.stripe_session_id) {
    return { state: 'open', operationId: row.id, amountSen: row.amount_sen, checkoutUrl: row.checkout_url };
  }
  const state = row.state === 'creating' || row.state === 'open' ? 'checking' : row.state;
  return { state, operationId: row.id, amountSen: row.amount_sen };
}

function getLiveMode(): boolean {
  return process.env.STRIPE_SECRET_KEY?.startsWith('sk_live_') ?? false;
}

async function loadOperation(ownerUserId: string, operationId: string): Promise<TopUpOperationRow | null> {
  const service = createServiceClient();
  const { data, error } = await service.rpc('get_wallet_topup_operation', {
    p_operation_id: operationId,
    p_owner_user_id: ownerUserId,
  });
  if (error) throw new Error('wallet_topup_status_unavailable');
  return parseOperation(data);
}

async function updateProviderState(
  ownerUserId: string,
  operationId: string,
  state: TopUpOperationRow['state'],
): Promise<TopUpOperationRow | null> {
  const service = createServiceClient();
  const { data, error } = await service.rpc('update_wallet_topup_provider_state', {
    p_operation_id: operationId,
    p_owner_user_id: ownerUserId,
    p_state: state,
    p_session_status: null,
  });
  if (error) throw new Error('wallet_topup_status_unavailable');
  return parseOperation(data);
}

async function resumeKnownSession(row: TopUpOperationRow): Promise<WalletTopUpResult> {
  if (!row.stripe_session_id) return publicResult(row);
  let session: Awaited<ReturnType<typeof stripe.checkout.sessions.retrieve>>;
  try {
    session = await stripe.checkout.sessions.retrieve(row.stripe_session_id);
  } catch {
    await updateProviderState(row.owner_user_id, row.id, 'checking');
    return { state: 'checking', operationId: row.id, amountSen: row.amount_sen };
  }

  const metadataMatches = session.metadata?.payment_kind === 'topup'
    && session.metadata?.user_id === row.owner_user_id
    && session.metadata?.topup_operation_id === row.id
    && session.amount_total === row.amount_sen
    && session.currency?.toUpperCase() === 'MYR'
    && session.livemode === row.is_live;
  if (!metadataMatches) throw new Error('wallet_topup_provider_session_mismatch');

  if (session.payment_status === 'paid') {
    await updateProviderState(row.owner_user_id, row.id, 'paid_pending_credit');
    return { state: 'paid_pending_credit', operationId: row.id, amountSen: row.amount_sen };
  }
  if (session.status === 'expired') {
    const updated = await updateProviderState(row.owner_user_id, row.id, 'expired');
    return updated ? publicResult(updated) : { state: 'expired', operationId: row.id, amountSen: row.amount_sen };
  }
  if (session.status === 'open' && session.url) {
    return { state: 'open', operationId: row.id, amountSen: row.amount_sen, checkoutUrl: session.url };
  }
  const updated = await updateProviderState(row.owner_user_id, row.id, 'checking');
  return updated ? publicResult(updated) : { state: 'checking', operationId: row.id, amountSen: row.amount_sen };
}

export async function startOrResumeWalletTopUp(input: {
  ownerUserId: string;
  email: string | null;
  fullName: string | null;
  amountSen: number;
  operationId: string;
}): Promise<WalletTopUpResult> {
  const appUrl = resolvePaymentAppUrl();
  const isLive = getLiveMode();
  const success = new URL('/customer/wallet', appUrl);
  success.searchParams.set('topup', 'success');
  success.searchParams.set('operation', input.operationId);
  const cancel = new URL('/customer/wallet', appUrl);
  cancel.searchParams.set('topup', 'cancel');
  cancel.searchParams.set('operation', input.operationId);

  const service = createServiceClient();
  const { data, error } = await service.rpc('prepare_wallet_topup_operation', {
    p_operation_id: input.operationId,
    p_owner_user_id: input.ownerUserId,
    p_amount_sen: input.amountSen,
    p_is_live: isLive,
    p_customer_email: input.email,
    p_customer_name: input.fullName,
    p_success_url: success.toString(),
    p_cancel_url: cancel.toString(),
  });
  if (error) throw new Error(error.message.includes('different_active_amount')
    ? 'wallet_topup_active_amount_conflict'
    : 'wallet_topup_prepare_unavailable');
  const operation = parseOperation(data);
  if (!operation) throw new Error('wallet_topup_prepare_unavailable');
  if (operation.state !== 'creating' || operation.stripe_session_id) {
    return resumeKnownSession(operation);
  }

  const createdAt = Date.parse(operation.created_at);
  if (!Number.isFinite(createdAt) || Date.now() - createdAt > LIVE_IDEMPOTENCY_WINDOW_MS) {
    const updated = await updateProviderState(input.ownerUserId, operation.id, 'checking');
    return updated ? publicResult(updated) : { state: 'checking', operationId: operation.id, amountSen: operation.amount_sen };
  }

  let customerId = operation.stripe_customer_id;
  if (!customerId) {
    const customer = await stripe.customers.create({
      email: operation.customer_email ?? undefined,
      name: operation.customer_name ?? undefined,
      metadata: { supabase_user_id: input.ownerUserId },
    }, { idempotencyKey: operation.stripe_customer_idempotency_key });
    customerId = customer.id;
    const { data: recorded, error: recordError } = await service.rpc('record_wallet_topup_customer', {
      p_operation_id: operation.id,
      p_owner_user_id: input.ownerUserId,
      p_customer_id: customerId,
    });
    if (recordError || recorded !== true) {
      await updateProviderState(input.ownerUserId, operation.id, 'checking').catch(() => undefined);
      return { state: 'checking', operationId: operation.id, amountSen: operation.amount_sen };
    }
  }

  let session: Awaited<ReturnType<typeof stripe.checkout.sessions.create>>;
  try {
    session = await stripe.checkout.sessions.create({
      customer: customerId,
      mode: 'payment',
      payment_method_types: ['card'],
      payment_intent_data: { metadata: { user_id: input.ownerUserId, payment_kind: 'topup', topup_operation_id: operation.id } },
      line_items: [{
        price_data: {
          currency: 'myr',
          unit_amount: operation.amount_sen,
          product_data: { name: 'Malaysia Tourism Wallet Top-up' },
        },
        quantity: 1,
      }],
      metadata: { user_id: input.ownerUserId, payment_kind: 'topup', topup_operation_id: operation.id },
      success_url: operation.success_url,
      cancel_url: operation.cancel_url,
    }, { idempotencyKey: operation.stripe_session_idempotency_key });
  } catch {
    await updateProviderState(input.ownerUserId, operation.id, 'checking').catch(() => undefined);
    return { state: 'checking', operationId: operation.id, amountSen: operation.amount_sen };
  }

  if (!session.url || session.livemode !== operation.is_live) {
    await updateProviderState(input.ownerUserId, operation.id, 'checking').catch(() => undefined);
    return { state: 'checking', operationId: operation.id, amountSen: operation.amount_sen };
  }
  const { data: stored, error: storeError } = await service.rpc('record_wallet_topup_session', {
    p_operation_id: operation.id,
    p_owner_user_id: input.ownerUserId,
    p_session_id: session.id,
    p_checkout_url: session.url,
    p_expires_at: session.expires_at ? new Date(session.expires_at * 1000).toISOString() : null,
  });
  const storedOperation = parseOperation(stored);
  if (storeError || !storedOperation) {
    await updateProviderState(input.ownerUserId, operation.id, 'checking').catch(() => undefined);
    return { state: 'checking', operationId: operation.id, amountSen: operation.amount_sen };
  }
  return publicResult(storedOperation);
}

export async function getWalletTopUp(ownerUserId: string, operationId: string): Promise<WalletTopUpResult | null> {
  const row = await loadOperation(ownerUserId, operationId);
  return row ? resumeKnownSession(row) : null;
}

export async function getActiveWalletTopUp(ownerUserId: string): Promise<WalletTopUpResult | null> {
  const service = createServiceClient();
  const { data, error } = await service.rpc('get_active_wallet_topup_operation', { p_owner_user_id: ownerUserId });
  if (error) throw new Error('wallet_topup_status_unavailable');
  const row = parseOperation(data);
  return row ? publicResult(row) : null;
}

export async function cancelWalletTopUp(ownerUserId: string, operationId: string): Promise<WalletTopUpResult | null> {
  const row = await loadOperation(ownerUserId, operationId);
  if (!row) return null;
  if (row.state === 'credited' || row.state === 'expired' || row.state === 'cancelled' || row.state === 'failed') {
    return publicResult(row);
  }
  if (!row.stripe_session_id) {
    const updated = await updateProviderState(ownerUserId, operationId, 'checking');
    return updated ? publicResult(updated) : null;
  }
  try {
    const session = await stripe.checkout.sessions.retrieve(row.stripe_session_id);
    if (session.payment_status === 'paid') {
      const updated = await updateProviderState(ownerUserId, operationId, 'paid_pending_credit');
      return updated ? publicResult(updated) : null;
    }
    if (session.status === 'open') await stripe.checkout.sessions.expire(row.stripe_session_id);
    const checked = await stripe.checkout.sessions.retrieve(row.stripe_session_id);
    const state = checked.payment_status === 'paid' ? 'paid_pending_credit' : checked.status === 'expired' ? 'cancelled' : 'checking';
    const updated = await updateProviderState(ownerUserId, operationId, state);
    return updated ? publicResult(updated) : null;
  } catch {
    const updated = await updateProviderState(ownerUserId, operationId, 'checking');
    return updated ? publicResult(updated) : null;
  }
}

export async function settleReconciledWalletTopUp(row: TopUpOperationRow, session: Awaited<ReturnType<typeof stripe.checkout.sessions.retrieve>>) {
  if (!row.stripe_session_id || session.id !== row.stripe_session_id
    || session.metadata?.payment_kind !== 'topup'
    || session.metadata?.user_id !== row.owner_user_id
    || session.metadata?.topup_operation_id !== row.id
    || session.payment_status !== 'paid'
    || session.amount_total !== row.amount_sen
    || session.currency?.toUpperCase() !== 'MYR'
    || session.livemode !== row.is_live) {
    throw new Error('wallet_topup_reconcile_mismatch');
  }
  const service = createServiceClient();
  const { data, error } = await service.rpc('apply_wallet_topup_payment', {
    p_operation_id: row.id,
    p_owner_user_id: row.owner_user_id,
    p_session_id: session.id,
    p_payment_intent_id: typeof session.payment_intent === 'string' ? session.payment_intent : null,
    p_amount_sen: row.amount_sen,
    p_currency: 'MYR',
    p_is_live: row.is_live,
    p_expected_is_live: getLiveMode(),
    p_payment_status: 'paid',
    p_event_id: `wallet-topup-reconcile:${session.id}`,
  });
  if (error) throw new Error('wallet_topup_reconcile_settlement_failed');
  return isRecord(data) && data.credited === true;
}

export type { TopUpOperationRow };
