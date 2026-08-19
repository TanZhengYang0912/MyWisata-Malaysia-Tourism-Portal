import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';
import { apiFail, apiOk } from '@/lib/validation/schemas';
import { z } from 'zod';
import { createHmac } from 'node:crypto';
import { isSimulatorCheckoutProvider } from '@/lib/payments/providers';
import { isPaymentSimulatorEnabled } from '@/lib/payments/simulator-config';

const schema = z.object({ action: z.enum(['approve', 'reject']), note: z.string().trim().max(500).optional() }).strict();
interface Props { params: Promise<{ refundId: string }> }

export async function POST(request: Request, { params }: Props) {
  const db = await createClient();
  const { data: { user } } = await db.auth.getUser();
  if (!user) return apiFail('UNAUTHORIZED', 'Sign in required', 401);
  const { data: roles } = await db.from('user_roles').select('roles(name)').eq('user_id', user.id);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const names = (roles ?? []).map((row: any) => row.roles?.name);
  if (!names.includes('super_admin') && !names.includes('approver')) return apiFail('FORBIDDEN', 'Admin role required', 403);
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return apiFail('VALIDATION_FAILED', 'action is required', 422);
  const service = createServiceClient();
  const { refundId } = await params;
  const { data: refund } = await service.from('refunds').select('id,order_id,payment_id,amount,status,payments(method,provider,provider_payment_id)').eq('id', refundId).maybeSingle();
  if (!refund) return apiFail('NOT_FOUND', 'Refund request not found', 404);
  if (refund.status !== 'pending') return apiFail('INVALID_STATE', 'Refund is already processed', 409);
  if (parsed.data.action === 'reject') {
    const { error } = await service.from('refunds').update({ status: 'rejected', processed_by: user.id, processed_at: new Date().toISOString(), reason: parsed.data.note ?? null }).eq('id', refundId);
    if (error) return apiFail('DB_ERROR', error.message, 500);
    return apiOk({ refundId, status: 'rejected' });
  }
  const payment = Array.isArray(refund.payments) ? refund.payments[0] : refund.payments;
  if (payment?.method === 'wallet') {
    const { data, error } = await db.rpc('process_wallet_refund', {
      p_refund_id: refundId,
      p_note: parsed.data.note ?? null,
    });
    if (error) {
      const message = error.message ?? 'Unable to process Wallet refund';
      return apiFail(message.includes('super_admin_required') ? 'FORBIDDEN' : 'REFUND_FAILED', message, message.includes('super_admin_required') ? 403 : 409);
    }
    return apiOk(data);
  }
  if (payment?.provider && isSimulatorCheckoutProvider(payment.provider)) {
    if (!isPaymentSimulatorEnabled()) {
      return apiFail('PAYMENT_SIMULATOR_UNAVAILABLE', 'Simulated provider refunds are unavailable in this environment', 503);
    }
    const secret = process.env.PAYMENT_SIMULATOR_WEBHOOK_SECRET ?? '';
    const providerRefundId = `sim_refund_${createHmac('sha256', secret)
      .update(`${refundId}:${payment.provider}`)
      .digest('hex')
      .slice(0, 40)}`;
    const { data, error } = await service.rpc('begin_simulated_refund', {
      p_refund_id: refundId,
      p_provider: payment.provider,
      p_provider_refund_id: providerRefundId,
    });
    if (error) return apiFail('REFUND_FAILED', error.message, 409);
    return apiOk(data);
  }
  if (payment?.provider === 'stripe') {
    if (!payment.provider_payment_id) return apiFail('INVALID_STATE', 'Stripe payment reference is missing', 409);
    try {
      const { stripe } = await import('@/lib/stripe');
      const session = await stripe.checkout.sessions.retrieve(payment.provider_payment_id, { expand: ['payment_intent'] });
      const paymentIntent = typeof session.payment_intent === 'string' ? session.payment_intent : session.payment_intent?.id;
      if (!paymentIntent) return apiFail('INVALID_STATE', 'Stripe payment intent is not available yet', 409);
      await stripe.refunds.create(
        { payment_intent: paymentIntent, amount: Math.round(Number(refund.amount) * 100) },
        { idempotencyKey: `refund:${refundId}` },
      );
    } catch (error) {
      return apiFail('REFUND_FAILED', error instanceof Error ? error.message : 'Stripe refund failed', 502);
    }
  }
  const { error: refundError } = await service.from('refunds').update({ status: 'processed', processed_by: user.id, processed_at: new Date().toISOString(), reason: parsed.data.note ?? null }).eq('id', refundId);
  if (refundError) return apiFail('DB_ERROR', refundError.message, 500);
  await service.from('payments').update({ status: 'refunded', updated_at: new Date().toISOString() }).eq('id', refund.payment_id);
  await service.from('orders').update({ status: 'refunded', updated_at: new Date().toISOString() }).eq('id', refund.order_id);
  return apiOk({ refundId, status: 'processed' });
}
