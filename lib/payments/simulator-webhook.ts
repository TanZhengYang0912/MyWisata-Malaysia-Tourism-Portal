import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';

const simulatorProviderSchema = z.enum([
  'tng_ewallet_simulator',
  'grabpay_simulator',
  'bank_transfer_simulator',
]);

const failureSchema = z.object({
  code: z.string().trim().min(1).max(120).regex(/^[A-Za-z0-9_.:-]+$/),
  message: z.string().trim().min(1).max(500),
  retryable: z.boolean(),
}).strict();

const commonSchema = {
  eventId: z.string().trim().min(1).max(255).regex(/^[A-Za-z0-9_.:-]+$/),
  provider: simulatorProviderSchema,
  amountSen: z.number().int().positive().safe(),
  currency: z.literal('MYR'),
};

const paymentEventSchema = z.object({
  kind: z.literal('payment'),
  ...commonSchema,
  providerPaymentId: z.string().trim().min(1).max(255).regex(/^sim_pay_[0-9a-f]+$/),
  checkoutSessionId: z.uuid(),
  eventType: z.enum([
    'payment.succeeded',
    'payment.failed',
    'payment.cancelled',
    'payment.expired',
  ]),
  failure: failureSchema.optional(),
}).strict();

const refundEventSchema = z.object({
  kind: z.literal('refund'),
  ...commonSchema,
  providerRefundId: z.string().trim().min(1).max(255).regex(/^sim_refund_[0-9a-f]+$/),
  refundId: z.uuid(),
  eventType: z.enum(['refund.succeeded', 'refund.failed']),
  failure: failureSchema.optional(),
}).strict();

const simulatorWebhookPayloadSchema = z.discriminatedUnion('kind', [
  paymentEventSchema,
  refundEventSchema,
]);

export type SimulatorWebhookPayload = z.infer<typeof simulatorWebhookPayloadSchema>;

export function signSimulatorWebhookPayload(rawBody: string, secret: string): string {
  return createHmac('sha256', secret).update(rawBody).digest('hex');
}

export function verifySimulatorWebhookSignature(
  rawBody: string,
  signature: string | null | undefined,
  secret: string,
): boolean {
  if (!secret || !signature || !/^[0-9a-f]{64}$/i.test(signature)) return false;

  const expected = Buffer.from(signSimulatorWebhookPayload(rawBody, secret), 'hex');
  const received = Buffer.from(signature, 'hex');
  return expected.length === received.length && timingSafeEqual(expected, received);
}

export function hashSimulatorWebhookPayload(rawBody: string): string {
  return createHash('sha256').update(rawBody).digest('hex');
}

export function parseSimulatorWebhookPayload(rawBody: string): SimulatorWebhookPayload {
  try {
    const result = simulatorWebhookPayloadSchema.safeParse(JSON.parse(rawBody));
    if (result.success) return result.data;
  } catch {
    // Malformed JSON and invalid schemas share one safe public error.
  }

  throw new Error('invalid_payment_simulator_webhook_payload');
}
