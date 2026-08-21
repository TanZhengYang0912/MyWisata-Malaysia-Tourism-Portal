import { after } from 'next/server';
import { isTngMockPayoutEnabled } from '@/lib/payouts/tng-config';
import type { TngWebhookPayload } from '@/lib/payouts/tng-webhook';
import { signTngWebhookPayload } from '@/lib/payouts/tng-webhook';
import { handleTngPayoutWebhook } from '@/lib/payouts/tng-webhook-handler';
import { createServiceClient } from '@/lib/supabase/service';

type TngMockCallbackJob = {
  id: string;
  withdrawal_id: string;
  provider_payout_id: string;
  amount_sen: number;
  event_key: string;
  event_id: string;
  outcome: 'paid' | 'failed';
  status: 'processing';
  available_at: string;
  provider_occurred_at: string;
  attempt_count: number;
  next_attempt_at: string;
  claimed_at: string | null;
  delivered_at: string | null;
  last_error_code: string | null;
  created_at: string;
  updated_at: string;
};

export type TngMockCallbackProcessResult = {
  claimed: number;
  delivered: number;
  retried: number;
  exhausted: number;
};

export type TngMockCallbackReconcileResult = {
  count: number;
  inserted: number;
  released: number;
};

const EMPTY_RESULT: TngMockCallbackProcessResult = {
  claimed: 0,
  delivered: 0,
  retried: 0,
  exhausted: 0,
};

function callbackPayload(job: TngMockCallbackJob): TngWebhookPayload {
  return {
    eventId: job.event_id,
    payoutId: job.provider_payout_id,
    withdrawalId: job.withdrawal_id,
    status: job.outcome,
    amountSen: Number(job.amount_sen),
    currency: 'MYR',
    occurredAt: job.provider_occurred_at,
    ...(job.outcome === 'failed'
      ? { failure: { code: 'mock_provider_rejected', message: 'Mock provider rejected the payout' } }
      : {}),
  };
}

function deliveryFailure(responseStatus: number): { code: string; retryable: boolean } {
  if (responseStatus >= 500) return { code: 'webhook_5xx', retryable: true };
  if (responseStatus === 409) return { code: 'settlement_conflict', retryable: false };
  return { code: 'webhook_4xx', retryable: false };
}

export async function processTngMockCallbacks(
  options: { limit?: number; jobId?: string } = {},
): Promise<TngMockCallbackProcessResult> {
  if (!isTngMockPayoutEnabled()) return { ...EMPTY_RESULT };

  const db = createServiceClient();
  const { data, error } = await db.rpc('claim_tng_mock_callback_outbox', {
    p_limit: Math.max(1, Math.min(options.limit ?? 20, 100)),
    p_outbox_id: options.jobId ?? null,
  });
  if (error) throw new Error('tng_callback_claim_failed');

  const jobs = Array.isArray(data) ? data as TngMockCallbackJob[] : [];
  const result: TngMockCallbackProcessResult = { ...EMPTY_RESULT, claimed: jobs.length };
  const secret = process.env.TNG_MOCK_WEBHOOK_SECRET ?? '';

  for (const job of jobs) {
    let delivered = false;
    let failure = { code: 'webhook_exception', retryable: true };
    try {
      const rawBody = JSON.stringify(callbackPayload(job));
      const response = await handleTngPayoutWebhook(new Request(
        'http://localhost/api/tng/payout/webhook',
        {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            'x-tng-signature': signTngWebhookPayload(rawBody, secret),
          },
          body: rawBody,
        },
      ));
      delivered = response.ok;
      if (!delivered) failure = deliveryFailure(response.status);
    } catch {
      delivered = false;
    }

    const { error: finishError } = await db.rpc('finish_tng_mock_callback_attempt', {
      p_outbox_id: job.id,
      p_delivered: delivered,
      p_error_code: delivered ? null : failure.code,
      p_retryable: delivered ? false : failure.retryable,
    });
    if (finishError) throw new Error('tng_callback_finish_failed');

    if (delivered) result.delivered += 1;
    else if (failure.retryable && job.attempt_count < 5) result.retried += 1;
    else result.exhausted += 1;
  }

  return result;
}

export async function reconcileTngMockCallbacks(
  options: { limit?: number; staleBefore?: string } = {},
): Promise<TngMockCallbackReconcileResult> {
  if (!isTngMockPayoutEnabled()) return { count: 0, inserted: 0, released: 0 };

  const db = createServiceClient();
  const { data, error } = await db.rpc('reconcile_tng_mock_callbacks', {
    p_stale_before: options.staleBefore ?? new Date(Date.now() - 5 * 60_000).toISOString(),
    p_limit: Math.max(1, Math.min(options.limit ?? 50, 100)),
  });
  if (error) throw new Error('tng_callback_reconcile_failed');

  const result = data as Partial<TngMockCallbackReconcileResult> | null;
  return {
    count: Number(result?.count ?? 0),
    inserted: Number(result?.inserted ?? 0),
    released: Number(result?.released ?? 0),
  };
}

export function scheduleTngMockCallbackAcceleration(jobId: string, availableAt: string): void {
  after(async () => {
    const dueAt = new Date(availableAt).getTime();
    const delayMs = Number.isFinite(dueAt) ? Math.max(0, Math.min(dueAt - Date.now(), 10_000)) : 0;
    if (delayMs > 0) {
      await new Promise<void>((resolve) => setTimeout(resolve, delayMs));
    }
    try {
      await processTngMockCallbacks({ limit: 1, jobId });
    } catch {
      console.error('[tng-mock-callback] accelerator failed:', 'callback_delivery_failed');
    }
  });
}
