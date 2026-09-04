import { apiFail, apiOk } from '@/lib/validation/schemas';
import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';

export const dynamic = 'force-dynamic';

export async function GET() {
  const db = await createClient();
  const { data: { user } } = await db.auth.getUser();
  if (!user) return apiFail('UNAUTHORIZED', 'Sign in required', 401);
  const { data: roles } = await db.from('user_roles').select('roles(name)').eq('user_id', user.id);
  const roleNames = (roles ?? []).map((row: any) => row.roles?.name);
  if (!roleNames.includes('super_admin')) {
    return apiFail('FORBIDDEN', 'Admin role required', 403);
  }

  const service = createServiceClient();
  const { data, error } = await service
    .from('refunds')
    .select('id,order_id,amount,reason,status,provider_refund_id,provider_failure_code,provider_failure_message,attempt_count,created_at,updated_at,payments(method,provider),orders(display_id)')
    .order('created_at', { ascending: false })
    .limit(200);
  if (error) return apiFail('DB_ERROR', 'Unable to load refund requests', 500);

  const refunds = (data ?? []).map((refund: any) => {
    const payment = Array.isArray(refund.payments) ? refund.payments[0] : refund.payments;
    const order = Array.isArray(refund.orders) ? refund.orders[0] : refund.orders;
    return {
      id: refund.id,
      orderId: refund.order_id,
      orderNumber: order?.display_id ?? null,
      amountRm: Number(refund.amount),
      reason: refund.reason ?? null,
      status: refund.status,
      provider: payment?.provider ?? null,
      method: payment?.method ?? null,
      providerRefundId: refund.provider_refund_id ?? null,
      failureCode: refund.provider_failure_code ?? null,
      failureMessage: refund.provider_failure_message ?? null,
      attemptCount: refund.attempt_count ?? 0,
      createdAt: refund.created_at,
      updatedAt: refund.updated_at,
    };
  });

  return apiOk({ refunds });
}
