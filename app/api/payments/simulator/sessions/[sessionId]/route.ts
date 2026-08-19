import { NextResponse } from 'next/server';
import { z } from 'zod';
import { isSimulatorCheckoutProvider } from '@/lib/payments/providers';
import { isPaymentSimulatorEnabled } from '@/lib/payments/simulator-config';
import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';

export const dynamic = 'force-dynamic';

type RouteContext = { params: Promise<{ sessionId: string }> };

export async function GET(_request: Request, { params }: RouteContext) {
  if (!isPaymentSimulatorEnabled()) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const { sessionId } = await params;
  if (!z.uuid().safeParse(sessionId).success) {
    return NextResponse.json({ error: 'Invalid simulator session' }, { status: 400 });
  }
  const db = await createClient();
  const { data: { user }, error: authError } = await db.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: session, error: sessionError } = await db
    .from('checkout_sessions')
    .select('id,user_id,order_id,status,currency,expires_at')
    .eq('id', sessionId)
    .maybeSingle();
  if (sessionError) return NextResponse.json({ error: 'Unable to load simulator session' }, { status: 503 });
  if (!session || session.user_id !== user.id) return NextResponse.json({ error: 'Simulator session not found' }, { status: 404 });

  const service = createServiceClient();
  const { data: payment, error: paymentError } = await service
    .from('payments')
    .select('method,provider,provider_payment_id,amount,status')
    .eq('order_id', session.order_id)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (paymentError) return NextResponse.json({ error: 'Unable to load simulator payment' }, { status: 503 });
  if (!payment || !isSimulatorCheckoutProvider(payment.provider) || !payment.provider_payment_id) {
    return NextResponse.json({ error: 'Simulator payment not found' }, { status: 404 });
  }

  return NextResponse.json({
    data: {
      sessionId: session.id,
      orderId: session.order_id,
      provider: payment.provider,
      providerPaymentId: payment.provider_payment_id,
      amountSen: Math.round(Number(payment.amount) * 100),
      currency: session.currency,
      status: session.status,
      expiresAt: session.expires_at,
      simulated: true,
    },
    error: null,
  });
}
