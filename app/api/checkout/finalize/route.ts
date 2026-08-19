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
  const { data, error } = await db.rpc('finalize_customer_wallet_checkout', {
    p_checkout_session_id: parsed.data.checkoutSessionId,
    p_outcome: parsed.data.outcome,
  });
  if (error) {
    if ((error.message ?? '').toLowerCase().includes('provider_confirmation_required')) {
      return NextResponse.json({
        data: null,
        error: {
          code: 'PROVIDER_CONFIRMATION_REQUIRED',
          message: 'External payments must be confirmed by the payment provider.',
        },
      }, { status: 403 });
    }
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
