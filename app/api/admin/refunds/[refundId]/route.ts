import { createServiceClient } from '@/lib/supabase/service';
import { apiFail, apiOk } from '@/lib/validation/schemas';
import { z } from 'zod';
import { processRefund } from '@/lib/refunds/process-refund';
import { requireStaffRoleManagementSuperAdmin } from '@/lib/staff-permissions/server';

const schema = z.object({
  evidenceVersion: z.string().length(32).optional(),
  action: z.enum(['approve', 'reject']),
  note: z.string().trim().max(500).optional(),
  manualReference: z.string().trim().min(5).max(255).optional(),
}).strict();
interface Props { params: Promise<{ refundId: string }> }

export async function POST(request: Request, { params }: Props) {
  const { db, user, response } = await requireStaffRoleManagementSuperAdmin();
  if (response) return response;
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return apiFail('VALIDATION_FAILED', 'action is required', 422);
  const service = createServiceClient();
  const { refundId } = await params;
  const { data: refund } = await service.from('refunds').select('id,status').eq('id', refundId).maybeSingle();
  if (!refund) return apiFail('NOT_FOUND', 'Refund request not found', 404);
  if (refund.status !== 'pending') return apiFail('INVALID_STATE', 'Refund is already processed', 409);
  if (parsed.data.action === 'reject') {
    const { error } = await service.rpc('reject_order_refund_review', { p_refund: refundId, p_actor: user.id, p_note: parsed.data.note ?? null });
    if (error) return apiFail('REVIEW_CONFLICT', 'This refund is already being processed or requires reimbursement.', 409);
    return apiOk({ refundId, status: 'rejected' });
  }
  const { error: reviewError } = await service.rpc('claim_event_refund_review', {
    p_refund: refundId, p_actor: user.id, p_version: parsed.data.evidenceVersion ?? null, p_note: parsed.data.note ?? null,
  });
  if (reviewError) return apiFail('REVIEW_CONFLICT', 'Pickup evidence changed or a review explanation is required. Refresh the request.', 409);
  const result = await processRefund({ service, walletDb: db, refundId, actorId: user.id, note: parsed.data.note ?? null, manualReference: parsed.data.manualReference ?? null });
  if (!result.ok) {
    await service.from('refunds').update({ auto_process: false, provider_failure_code: result.code,
      provider_failure_message: 'Refund requires operator attention', updated_at: new Date().toISOString() }).eq('id', refundId).eq('status', 'pending');
    return apiFail(result.code, result.message, result.status);
  }
  return apiOk(result.data);
}
