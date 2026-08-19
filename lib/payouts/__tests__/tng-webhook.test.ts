import { describe, expect, it } from 'vitest';
import {
  hashTngWebhookPayload,
  parseTngWebhookPayload,
  signTngWebhookPayload,
  verifyTngWebhookSignature,
} from '../tng-webhook';

const secret = 'local-test-webhook-secret';
const payload = JSON.stringify({
  eventId: 'evt_test_paid_001',
  payoutId: 'tng_payout_0123456789abcdef0123456789abcdef',
  withdrawalId: '9e703f42-7f40-4a4f-a4a0-447eb6319931',
  status: 'paid',
});

describe('TNG mock webhook contract', () => {
  it('accepts the exact signed raw body and rejects an altered body', () => {
    const signature = signTngWebhookPayload(payload, secret);

    expect(verifyTngWebhookSignature(payload, signature, secret)).toBe(true);
    expect(verifyTngWebhookSignature(`${payload} `, signature, secret)).toBe(false);
    expect(verifyTngWebhookSignature(payload, 'not-hex', secret)).toBe(false);
  });

  it('produces a stable SHA-256 payload receipt without storing the body', () => {
    expect(hashTngWebhookPayload(payload)).toMatch(/^[0-9a-f]{64}$/);
    expect(hashTngWebhookPayload(payload)).toBe(hashTngWebhookPayload(payload));
  });

  it('strictly parses the canonical paid payload', () => {
    expect(parseTngWebhookPayload(payload)).toEqual({
      eventId: 'evt_test_paid_001',
      payoutId: 'tng_payout_0123456789abcdef0123456789abcdef',
      withdrawalId: '9e703f42-7f40-4a4f-a4a0-447eb6319931',
      status: 'paid',
    });
  });

  it('accepts bounded failure fields and rejects unknown or unsafe fields', () => {
    const failed = JSON.stringify({
      eventId: 'evt_test_failed_001',
      payoutId: 'tng_payout_0123456789abcdef0123456789abcdef',
      withdrawalId: '9e703f42-7f40-4a4f-a4a0-447eb6319931',
      status: 'failed',
      failure: { code: 'destination_rejected', message: 'Recipient was rejected' },
    });

    expect(parseTngWebhookPayload(failed)).toMatchObject({ status: 'failed' });
    expect(() => parseTngWebhookPayload(JSON.stringify({
      ...JSON.parse(payload),
      rawProviderResponse: { token: 'must-not-be-accepted' },
    }))).toThrow('invalid_tng_webhook_payload');
    expect(() => parseTngWebhookPayload(JSON.stringify({
      ...JSON.parse(failed),
      failure: { code: 'bad code with spaces', message: 'Rejected' },
    }))).toThrow('invalid_tng_webhook_payload');
  });
});
