import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { verifyTngWebhookSignature } from '@/lib/payouts/tng-webhook';

const mocks = vi.hoisted(() => ({
  rpc: vi.fn(),
  createServiceClient: vi.fn(),
  handleWebhook: vi.fn(),
  after: vi.fn(),
}));

vi.mock('@/lib/supabase/service', () => ({
  createServiceClient: mocks.createServiceClient,
}));
vi.mock('@/lib/payouts/tng-webhook-handler', () => ({
  handleTngPayoutWebhook: mocks.handleWebhook,
}));
vi.mock('next/server', () => ({ after: mocks.after }));

import {
  processTngMockCallbacks,
  reconcileTngMockCallbacks,
  scheduleTngMockCallbackAcceleration,
} from '../tng-mock-callbacks';

const secret = 'local-test-webhook-secret';
const job = {
  id: '11111111-1111-4111-8111-111111111111',
  withdrawal_id: '22222222-2222-4222-8222-222222222222',
  provider_payout_id: 'tng_payout_0123456789abcdef0123456789abcdef',
  amount_sen: 5_000,
  event_key: 'tng_mock:22222222-2222-4222-8222-222222222222:paid',
  event_id: 'tng_evt_0123456789abcdef0123456789abcdef',
  outcome: 'paid' as const,
  status: 'processing' as const,
  available_at: '2026-08-21T05:00:03.000Z',
  provider_occurred_at: '2026-08-21T05:00:03.000Z',
  attempt_count: 1,
  next_attempt_at: '2026-08-21T05:00:03.000Z',
  claimed_at: '2026-08-21T05:00:03.000Z',
  delivered_at: null,
  last_error_code: null,
  created_at: '2026-08-21T05:00:00.000Z',
  updated_at: '2026-08-21T05:00:03.000Z',
};

describe('TNG mock callback outbox processor', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useRealTimers();
    vi.stubEnv('NODE_ENV', 'test');
    vi.stubEnv('TNG_PAYOUT_MODE', 'mock');
    vi.stubEnv('TNG_MOCK_WEBHOOK_SECRET', secret);
    mocks.createServiceClient.mockReturnValue({ rpc: mocks.rpc });
    mocks.rpc.mockImplementation((name: string) => {
      if (name === 'claim_tng_mock_callback_outbox') return Promise.resolve({ data: [job], error: null });
      if (name === 'finish_tng_mock_callback_attempt') return Promise.resolve({ data: { status: 'delivered' }, error: null });
      if (name === 'reconcile_tng_mock_callbacks') return Promise.resolve({ data: { count: 2, inserted: 1, released: 1 }, error: null });
      throw new Error(`unexpected rpc ${name}`);
    });
    mocks.handleWebhook.mockResolvedValue(new Response(JSON.stringify({ received: true }), { status: 200 }));
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
  });

  it('builds and signs a canonical paid callback before marking delivery', async () => {
    const result = await processTngMockCallbacks({ limit: 10 });

    expect(result).toEqual({ claimed: 1, delivered: 1, retried: 0, exhausted: 0 });
    const request = mocks.handleWebhook.mock.calls[0]?.[0] as Request;
    const rawBody = await request.text();
    expect(JSON.parse(rawBody)).toEqual({
      eventId: job.event_id,
      payoutId: job.provider_payout_id,
      withdrawalId: job.withdrawal_id,
      status: 'paid',
      amountSen: 5_000,
      currency: 'MYR',
      occurredAt: job.provider_occurred_at,
    });
    expect(verifyTngWebhookSignature(rawBody, request.headers.get('x-tng-signature'), secret)).toBe(true);
    expect(mocks.rpc).toHaveBeenCalledWith('finish_tng_mock_callback_attempt', {
      p_outbox_id: job.id,
      p_delivered: true,
      p_error_code: null,
      p_retryable: false,
    });
  });

  it('routes a fixture-only failed outcome through the same signed handler', async () => {
    mocks.rpc.mockImplementation((name: string) => name === 'claim_tng_mock_callback_outbox'
      ? Promise.resolve({ data: [{ ...job, outcome: 'failed', event_key: `${job.event_key}:failed` }], error: null })
      : Promise.resolve({ data: { status: 'delivered' }, error: null }));

    await processTngMockCallbacks({ limit: 1 });

    const request = mocks.handleWebhook.mock.calls[0]?.[0] as Request;
    await expect(request.json()).resolves.toMatchObject({
      status: 'failed',
      failure: { code: 'mock_provider_rejected' },
    });
  });

  it('retries temporary handler failures and exhausts settlement conflicts', async () => {
    mocks.handleWebhook.mockResolvedValueOnce(new Response(null, { status: 503 }));
    const retried = await processTngMockCallbacks({ limit: 1 });
    expect(retried).toEqual({ claimed: 1, delivered: 0, retried: 1, exhausted: 0 });
    expect(mocks.rpc).toHaveBeenLastCalledWith('finish_tng_mock_callback_attempt', expect.objectContaining({
      p_error_code: 'webhook_5xx',
      p_retryable: true,
    }));

    mocks.handleWebhook.mockResolvedValueOnce(new Response(null, { status: 409 }));
    const exhausted = await processTngMockCallbacks({ limit: 1 });
    expect(exhausted).toEqual({ claimed: 1, delivered: 0, retried: 0, exhausted: 1 });
    expect(mocks.rpc).toHaveBeenLastCalledWith('finish_tng_mock_callback_attempt', expect.objectContaining({
      p_error_code: 'settlement_conflict',
      p_retryable: false,
    }));
  });

  it('does nothing when mock mode is disabled in production', async () => {
    vi.stubEnv('NODE_ENV', 'production');

    await expect(processTngMockCallbacks({ limit: 1 })).resolves.toEqual({
      claimed: 0, delivered: 0, retried: 0, exhausted: 0,
    });
    expect(mocks.createServiceClient).not.toHaveBeenCalled();
    expect(mocks.handleWebhook).not.toHaveBeenCalled();
  });

  it('reconciles only through the service-role RPC when mock mode is enabled', async () => {
    await expect(reconcileTngMockCallbacks()).resolves.toEqual({ count: 2, inserted: 1, released: 1 });
    expect(mocks.rpc).toHaveBeenCalledWith('reconcile_tng_mock_callbacks', expect.objectContaining({
      p_limit: 50,
    }));
  });

  it('uses a post-response callback to accelerate one exact due job', async () => {
    vi.useFakeTimers();
    let deferred: (() => Promise<void>) | undefined;
    mocks.after.mockImplementation((callback: () => Promise<void>) => { deferred = callback; });
    const availableAt = new Date(Date.now() + 3_000).toISOString();

    scheduleTngMockCallbackAcceleration(job.id, availableAt);
    expect(mocks.after).toHaveBeenCalledOnce();
    expect(deferred).toBeTypeOf('function');

    const completion = deferred?.();
    await vi.advanceTimersByTimeAsync(3_000);
    await completion;

    expect(mocks.rpc).toHaveBeenCalledWith('claim_tng_mock_callback_outbox', {
      p_limit: 1,
      p_outbox_id: job.id,
    });
  });
});
