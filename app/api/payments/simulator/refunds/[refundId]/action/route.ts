import { createHmac } from 'node:crypto';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { isSimulatorCheckoutProvider } from '@/lib/payments/providers';
import { isPaymentSimulatorEnabled } from '@/lib/payments/simulator-config';
import { settleSimulatorEvent } from '@/lib/payments/settle-simulator-event';
import { signSimulatorWebhookPayload } from '@/lib/payments/simulator-webhook';
import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';

export const dynamic = 'force-dynamic';

const actionSchema = z.object({ outcome: z.enum(['succeeded', 'failed']) }).strict();
type RouteContext = { params: Promise<{ refundId: string }> };

export async function POST(request: Request, { params }: RouteContext) {
  if (!isPaymentSimulatorEnabled()) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const { refundId } = await params;
  if (!z.uuid().safeParse(refundId).success) {
    return NextResponse.json({ error: 'Invalid refund' }, { status: 400 });
  }
  const parsed = actionSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({
      data: null,
      error: { code: 'VALIDATION_FAILED', message: 'A valid simulator outcome is required.' },
    }, { status: 422 });
  }

  const db = await createClient();
  const { data: { user }, error: authError } = await db.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { data: roles } = await db.from('user_roles').select('roles(name)').eq('user_id', user.id);
  const roleNames = (roles ?? []).map((row: any) => row.roles?.name);
  if (!roleNames.includes('super_admin')) {
    return NextResponse.json({ error: 'Super Admin role required' }, { status: 403 });
  }

  const service = createServiceClient();
  const { data: refund, error: refundError } = await service
    .from('refunds')
    .select('id,order_id,amount,status,attempt_count,provider_refund_id,payments(provider)')
    .eq('id', refundId)
    .maybeSingle();
  if (refundError) return NextResponse.json({ error: 'Unable to load simulated refund' }, { status: 503 });
  const payment = Array.isArray(refund?.payments) ? refund.payments[0] : refund?.payments;
  if (!refund || refund.status !== 'approved' || !refund.provider_refund_id
      || !Number.isInteger(refund.attempt_count) || refund.attempt_count < 1
      || !payment || !isSimulatorCheckoutProvider(payment.provider)) {
    return NextResponse.json({ error: 'Simulated refund is not ready' }, { status: 409 });
  }

  const secret = process.env.PAYMENT_SIMULATOR_WEBHOOK_SECRET ?? '';
  const outcome = parsed.data.outcome;
  const digest = createHmac('sha256', secret)
    .update(`${refund.id}:${payment.provider}:${refund.attempt_count}:${outcome}:${refund.provider_refund_id}`)
    .digest('hex')
    .slice(0, 40);
  const payload = {
    kind: 'refund' as const,
    eventId: `sim_evt_${digest}`,
    provider: payment.provider,
    providerRefundId: refund.provider_refund_id,
    refundId: refund.id,
    eventType: `refund.${outcome}` as const,
    amountSen: Math.round(Number(refund.amount) * 100),
    currency: 'MYR' as const,
    ...(outcome === 'failed' ? {
      failure: {
        code: 'simulator_timeout',
        message: 'The simulated provider timed out while processing this refund.',
        retryable: true,
      },
    } : {}),
  };
  const rawBody = JSON.stringify(payload);
  const signature = signSimulatorWebhookPayload(rawBody, secret);

  try {
    const result = await settleSimulatorEvent(rawBody, signature);
    return NextResponse.json({ data: result, error: null });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'simulator_refund_action_failed';
    if (message.includes('conflict')) {
      return NextResponse.json({ error: 'Refund state conflicts with this simulator action' }, { status: 409 });
    }
    console.error('[payment-simulator] refund action failed', message);
    return NextResponse.json({ error: 'Unable to complete simulated refund action' }, { status: 502 });
  }
}
