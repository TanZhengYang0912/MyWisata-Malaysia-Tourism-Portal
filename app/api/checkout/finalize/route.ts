import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { parseBody, checkoutFinalizeSchema } from '@/lib/validation/schemas';
import { getCheckoutErrorCode, getCheckoutErrorMessage } from '@/lib/checkout/errors';
import { createServiceClient } from '@/lib/supabase/service';
import { emitOrderVendorEvent } from '@/lib/vendor-notifications/order-events';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const db = await createClient();
  const { data: { user }, error: authError } = await db.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const parsed = await parseBody(request, checkoutFinalizeSchema);
  if (!parsed.ok) return parsed.response;
  const { data, error } = await db.rpc('finalize_checkout', {
    p_checkout_session_id: parsed.data.checkoutSessionId,
    p_outcome: parsed.data.outcome,
    p_provider_payment_id: parsed.data.providerPaymentId ?? null,
    p_provider_event_id: parsed.data.providerEventId ?? null,
  });
  if (error) {
    const code = getCheckoutErrorCode(error.message);
    return NextResponse.json(
      { data: null, error: { code, message: getCheckoutErrorMessage(error.message) } },
      { status: 409 },
    );
  }
  const orderId = data && typeof data === 'object' && 'order_id' in data && typeof data.order_id === 'string' ? data.order_id : null;
  if (parsed.data.outcome === 'succeeded' && orderId) {
    void emitOrderVendorEvent({
      serviceDb: createServiceClient(),
      orderId,
      eventKey: `order:paid:${orderId}`,
      type: 'vendor_order_created',
      title: 'New order received',
      body: `Order ${orderId} has been paid and is ready for fulfilment.`,
      email: true,
    }).catch((notificationError) => console.error('[vendor-notifications] checkout order event failed', notificationError));
  }
  return NextResponse.json({ data, error: null });
}
