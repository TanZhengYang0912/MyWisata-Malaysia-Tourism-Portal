import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { parseBody, checkoutFinalizeSchema } from '@/lib/validation/schemas';
import { getCheckoutErrorCode, getCheckoutErrorMessage } from '@/lib/checkout/errors';

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
  return NextResponse.json({ data, error: null });
}
