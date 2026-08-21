import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';

const failureSchema = z.object({
  code: z.string().trim().min(1).max(120).regex(/^[A-Za-z0-9_.:-]+$/).optional(),
  message: z.string().trim().min(1).max(500).optional(),
}).strict();

const tngWebhookPayloadSchema = z.object({
  eventId: z.string().trim().min(1).max(255),
  payoutId: z.string().trim().min(1).max(255),
  withdrawalId: z.uuid(),
  status: z.enum(['paid', 'failed']),
  amountSen: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  currency: z.literal('MYR'),
  occurredAt: z.iso.datetime({ offset: true }),
  failure: failureSchema.optional(),
}).strict();

export type TngWebhookPayload = z.infer<typeof tngWebhookPayloadSchema>;

export function signTngWebhookPayload(rawBody: string, secret: string): string {
  return createHmac('sha256', secret).update(rawBody).digest('hex');
}

export function verifyTngWebhookSignature(
  rawBody: string,
  signature: string | null | undefined,
  secret: string,
): boolean {
  if (!secret || !signature || !/^[0-9a-f]{64}$/i.test(signature)) return false;

  const expected = Buffer.from(signTngWebhookPayload(rawBody, secret), 'hex');
  const received = Buffer.from(signature, 'hex');
  return expected.length === received.length && timingSafeEqual(expected, received);
}

export function hashTngWebhookPayload(rawBody: string): string {
  return createHash('sha256').update(rawBody).digest('hex');
}

export function parseTngWebhookPayload(rawBody: string): TngWebhookPayload {
  try {
    const result = tngWebhookPayloadSchema.safeParse(JSON.parse(rawBody));
    if (result.success) return result.data;
  } catch {
    // Return the same safe public error for malformed JSON and schema failures.
  }

  throw new Error('invalid_tng_webhook_payload');
}
