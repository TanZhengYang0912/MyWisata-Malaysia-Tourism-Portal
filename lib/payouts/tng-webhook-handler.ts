import { NextResponse } from 'next/server';
import { enqueueWithdrawalEmail } from '@/lib/email/events';
import { normalizeProviderFailure } from '@/lib/payouts/failures';
import { isTngMockPayoutEnabled } from '@/lib/payouts/tng-config';
import {
  hashTngWebhookPayload,
  parseTngWebhookPayload,
  verifyTngWebhookSignature,
} from '@/lib/payouts/tng-webhook';
import { createServiceClient } from '@/lib/supabase/service';

type SettlementResult = {
  request_id: string;
  user_id: string;
  amount_rm: number | string;
  status: 'paid' | 'failed';
  idempotent: boolean;
};

const SETTLEMENT_CONFLICT_CODES = [
  'provider_amount_conflict',
  'provider_currency_conflict',
  'provider_payout_id_conflict',
  'provider_event_conflict',
  'provider_event_state_conflict',
  'payout_provider_mismatch',
] as const;

function settlementConflictCode(message: string): string | null {
  return SETTLEMENT_CONFLICT_CODES.find((code) => message.includes(code)) ?? null;
}

export async function handleTngPayoutWebhook(request: Request): Promise<Response> {
  if (!isTngMockPayoutEnabled()) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const rawBody = await request.text();
  const signature = request.headers.get('x-tng-signature');
  const secret = process.env.TNG_MOCK_WEBHOOK_SECRET ?? '';

  if (!verifyTngWebhookSignature(rawBody, signature, secret)) {
    return NextResponse.json({ error: 'Invalid webhook signature' }, { status: 401 });
  }

  let payload;
  try {
    payload = parseTngWebhookPayload(rawBody);
  } catch {
    return NextResponse.json({ error: 'Invalid webhook payload' }, { status: 400 });
  }

  const failure = payload.status === 'failed'
    ? normalizeProviderFailure({
      provider: 'tng_direct_credit',
      code: payload.failure?.code,
      message: payload.failure?.message,
    })
    : null;
  const db = createServiceClient();
  const { data, error } = await db.rpc('settle_provider_withdrawal', {
    p_withdrawal_id: payload.withdrawalId,
    p_provider: 'tng_direct_credit',
    p_event_id: payload.eventId,
    p_provider_payout_id: payload.payoutId,
    p_status: payload.status,
    p_failure_code: failure?.code ?? null,
    p_failure_message: failure?.message ?? null,
    p_failure_category: failure?.category ?? null,
    p_retryable: failure?.retryable ?? false,
    p_payload_sha256: hashTngWebhookPayload(rawBody),
    p_amount_sen: payload.amountSen,
    p_currency: payload.currency,
    p_provider_occurred_at: payload.occurredAt,
    p_signature_verified: true,
    p_verification_method: 'hmac_sha256',
    p_ingestion_source: 'tng_mock_webhook',
  });

  if (error || !data) {
    const conflictCode = settlementConflictCode(error?.message ?? '');
    console.error('[tng-mock-webhook] settlement failed:', conflictCode ?? 'database_error');
    if (conflictCode) {
      return NextResponse.json({ error: 'Settlement conflict' }, { status: 409 });
    }
    return NextResponse.json({ error: 'Unable to settle withdrawal' }, { status: 500 });
  }

  const result = data as SettlementResult;
  if (!result.idempotent) {
    try {
      await enqueueWithdrawalEmail({
        withdrawalId: result.request_id,
        userId: result.user_id,
        eventType: result.status === 'paid' ? 'withdrawal_paid' : 'withdrawal_failed',
        amountRm: Number(result.amount_rm),
      });
    } catch {
      console.error('[tng-mock-webhook] email enqueue failed:', 'email_outbox_error');
    }
  }

  return NextResponse.json({
    received: true,
    status: result.status,
    idempotent: Boolean(result.idempotent),
  });
}
