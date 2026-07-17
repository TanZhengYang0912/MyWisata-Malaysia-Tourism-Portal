import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { moderateAccountText } from '@/lib/moderation';
import { requestIp } from '@/lib/wallet/request-ip';
import { apiFail, apiOk, parseBody } from '@/lib/validation/schemas';

export const dynamic = 'force-dynamic';

const overrideSchema = z.object({
  reason: z.string().trim().min(10).max(500),
}).strict();

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: withdrawalId } = await params;
  const db = await createClient();
  const { data: { user }, error: authError } = await db.auth.getUser();
  if (authError || !user) return apiFail('UNAUTHORIZED', 'Sign in required', 401);

  const parsed = await parseBody(request, overrideSchema);
  if (!parsed.ok) return parsed.response;

  const moderation = await moderateAccountText(parsed.data.reason, 'withdrawal_fraud_override_reason');
  if ('error' in moderation) {
    return apiFail('MODERATION_UNAVAILABLE', 'Content review is temporarily unavailable; please try again', 503);
  }
  if (moderation.flagged) {
    return apiFail('CONTENT_REJECTED', 'The override reason contains disallowed content', 422);
  }

  const { data, error } = await db.rpc('override_withdrawal_risk', {
    p_withdrawal_id: withdrawalId,
    p_reason:        parsed.data.reason,
    p_ip:            requestIp(request),
  });

  if (error) {
    const msg = error.message ?? '';
    if (msg.includes('super_admin_required')) return apiFail('FORBIDDEN', 'Super Admin access required', 403);
    if (msg.includes('self_dealing'))         return apiFail('SELF_DEALING', 'You cannot override risk on your own withdrawal', 409);
    if (msg.includes('withdrawal_not_found')) return apiFail('NOT_FOUND', 'Withdrawal not found', 404);
    if (msg.includes('risk_not_assessed'))    return apiFail('RISK_NOT_ASSESSED', 'Risk has not been assessed for this withdrawal', 409);
    if (msg.includes('risk_not_high'))        return apiFail('RISK_NOT_HIGH', 'Risk is not high — override is only applicable to high-risk requests', 409);
    if (msg.includes('withdrawal_not_overridable')) return apiFail('INVALID_STATE', 'Withdrawal is in a terminal or non-reviewable state', 409);
    console.error('[fraud-override] override_withdrawal_risk:', error);
    return apiFail('OVERRIDE_FAILED', 'Override failed', 500);
  }

  return apiOk(data as { request_id: string; risk_level: string; overridden_at: string });
}
