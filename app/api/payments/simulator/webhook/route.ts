import { NextResponse } from 'next/server';
import { isPaymentSimulatorEnabled } from '@/lib/payments/simulator-config';
import { settleSimulatorEvent } from '@/lib/payments/settle-simulator-event';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  if (!isPaymentSimulatorEnabled()) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const rawBody = await request.text();
  const signature = request.headers.get('x-mywisata-simulator-signature');
  try {
    const result = await settleSimulatorEvent(rawBody, signature);
    return NextResponse.json({ received: true, ...result });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'simulator_webhook_failed';
    if (message === 'invalid_simulator_webhook_signature') {
      return NextResponse.json({ error: 'Invalid webhook signature' }, { status: 401 });
    }
    if (message === 'invalid_payment_simulator_webhook_payload') {
      return NextResponse.json({ error: 'Invalid webhook payload' }, { status: 400 });
    }
    if (message.includes('conflict')) {
      return NextResponse.json({ error: 'Webhook event conflicts with existing payment state' }, { status: 409 });
    }
    console.error('[payment-simulator] webhook settlement failed', message);
    return NextResponse.json({ error: 'Unable to settle simulated provider event' }, { status: 500 });
  }
}
