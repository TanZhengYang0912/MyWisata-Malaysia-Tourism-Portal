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

export const dynamic = 'force-dynamic';

type SettlementResult = {
  request_id: string;
  user_id: string;
  amount_rm: number | string;
  status: 'paid' | 'failed';
  idempotent: boolean;
};

export async function POST(request: Request) {
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
  });

  if (error || !data) {
    console.error('[tng-mock-webhook] settlement failed:', error?.message ?? 'missing result');
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
    } catch (emailError) {
      console.error('[tng-mock-webhook] email enqueue failed:', emailError);
    }
  }

  return NextResponse.json({
    received: true,
    status: result.status,
    idempotent: Boolean(result.idempotent),
  });
}
