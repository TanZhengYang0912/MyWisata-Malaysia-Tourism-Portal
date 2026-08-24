import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { signTngWebhookPayload } from '@/lib/payouts/tng-webhook';

const mocks = vi.hoisted(() => ({
  rpc: vi.fn(),
  createServiceClient: vi.fn(),
  enqueueWithdrawalEmail: vi.fn(),
}));

vi.mock('@/lib/supabase/service', () => ({
  createServiceClient: mocks.createServiceClient,
}));

vi.mock('@/lib/email/events', () => ({
  enqueueWithdrawalEmail: mocks.enqueueWithdrawalEmail,
}));

import { POST } from '../route';

const secret = 'local-test-webhook-secret';
const paidPayload = {
  eventId: 'evt_test_paid_001',
  payoutId: 'tng_payout_0123456789abcdef0123456789abcdef',
  withdrawalId: '9e703f42-7f40-4a4f-a4a0-447eb6319931',
  status: 'paid' as const,
  amountSen: 2500,
  currency: 'MYR' as const,
  occurredAt: '2026-08-21T05:00:03.000Z',
};

function signedRequest(payload: object, signatureSecret = secret): Request {
  const body = JSON.stringify(payload);
  return new Request('http://localhost/api/tng/payout/webhook', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-tng-signature': signTngWebhookPayload(body, signatureSecret),
    },
    body,
  });
}

describe('POST /api/tng/payout/webhook', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('NODE_ENV', 'test');
    vi.stubEnv('TNG_PAYOUT_MODE', 'mock');
    vi.stubEnv('TNG_MOCK_WEBHOOK_SECRET', secret);
    mocks.createServiceClient.mockReturnValue({ rpc: mocks.rpc });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('rejects an invalid signature before creating a database client', async () => {
    const response = await POST(signedRequest(paidPayload, 'wrong-secret'));

    expect(response.status).toBe(401);
    expect(mocks.createServiceClient).not.toHaveBeenCalled();
  });

  it('rejects mock callbacks in production before touching Supabase', async () => {
    vi.stubEnv('NODE_ENV', 'production');

    const response = await POST(signedRequest(paidPayload));

    expect(response.status).toBe(404);
    expect(mocks.createServiceClient).not.toHaveBeenCalled();
  });

  it('settles a paid callback and sends email only after the RPC succeeds', async () => {
    mocks.rpc.mockResolvedValue({
      data: {
        request_id: paidPayload.withdrawalId,
        user_id: '1d4057cf-c821-4b05-a454-61dbdc42d32c',
        amount_rm: 25,
        status: 'paid',
        idempotent: false,
      },
      error: null,
    });

    const response = await POST(signedRequest(paidPayload));

    expect(response.status).toBe(200);
    expect(mocks.rpc).toHaveBeenCalledWith('settle_provider_withdrawal', expect.objectContaining({
      p_withdrawal_id: paidPayload.withdrawalId,
      p_provider: 'tng_direct_credit',
      p_event_id: paidPayload.eventId,
      p_provider_payout_id: paidPayload.payoutId,
      p_status: 'paid',
      p_payload_sha256: expect.stringMatching(/^[0-9a-f]{64}$/),
      p_amount_sen: 2500,
      p_currency: 'MYR',
      p_provider_occurred_at: '2026-08-21T05:00:03.000Z',
      p_signature_verified: true,
      p_verification_method: 'hmac_sha256',
      p_ingestion_source: 'tng_mock_webhook',
    }));
    expect(mocks.enqueueWithdrawalEmail).toHaveBeenCalledWith({
      withdrawalId: paidPayload.withdrawalId,
      userId: '1d4057cf-c821-4b05-a454-61dbdc42d32c',
      eventType: 'withdrawal_paid',
      amountRm: 25,
    });
  });

  it('normalizes failed callback details before atomic settlement', async () => {
    mocks.rpc.mockResolvedValue({
      data: {
        request_id: paidPayload.withdrawalId,
        user_id: '1d4057cf-c821-4b05-a454-61dbdc42d32c',
        amount_rm: 25,
        status: 'failed',
        idempotent: false,
      },
      error: null,
    });
    const failedPayload = {
      ...paidPayload,
      eventId: 'evt_test_failed_001',
      status: 'failed' as const,
      failure: {
        code: 'timeout',
        message: 'secret=do-not-store; provider timed out',
      },
    };

    const response = await POST(signedRequest(failedPayload));

    expect(response.status).toBe(200);
    expect(mocks.rpc).toHaveBeenCalledWith('settle_provider_withdrawal', expect.objectContaining({
      p_failure_code: 'timeout',
      p_failure_message: 'secret=[redacted]; provider timed out',
      p_failure_category: 'timeout',
      p_retryable: true,
    }));
    expect(mocks.enqueueWithdrawalEmail).toHaveBeenCalledWith(expect.objectContaining({
      eventType: 'withdrawal_failed',
    }));
  });

  it('acknowledges a duplicate event without sending duplicate email', async () => {
    mocks.rpc.mockResolvedValue({
      data: {
        request_id: paidPayload.withdrawalId,
        user_id: '1d4057cf-c821-4b05-a454-61dbdc42d32c',
        amount_rm: 25,
        status: 'paid',
        idempotent: true,
      },
      error: null,
    });

    const response = await POST(signedRequest(paidPayload));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({ received: true, idempotent: true });
    expect(mocks.enqueueWithdrawalEmail).not.toHaveBeenCalled();
  });

  it('returns a generic conflict for an amount or provider mismatch without sending email', async () => {
    mocks.rpc.mockResolvedValue({
      data: null,
      error: { message: 'provider_amount_conflict' },
    });

    const response = await POST(signedRequest(paidPayload));
    const body = await response.json();

    expect(response.status).toBe(409);
    expect(body).toEqual({ error: 'Settlement conflict' });
    expect(JSON.stringify(body)).not.toContain('provider_amount_conflict');
    expect(mocks.enqueueWithdrawalEmail).not.toHaveBeenCalled();
  });
});
