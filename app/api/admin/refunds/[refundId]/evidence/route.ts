import { apiFail, apiOk } from '@/lib/validation/schemas';
import { createServiceClient } from '@/lib/supabase/service';
import { requireStaffRoleManagementSuperAdmin } from '@/lib/staff-permissions/server';

interface Props { params: Promise<{ refundId: string }> }

export async function GET(_request: Request, { params }: Props) {
  const { response } = await requireStaffRoleManagementSuperAdmin();
  if (response) return response;
  const { refundId } = await params;
  const service = createServiceClient();
  const { data: refund, error: refundError } = await service.from('refunds').select('id').eq('id', refundId).maybeSingle();
  if (refundError) return apiFail('DB_ERROR', 'Unable to load refund evidence', 500);
  if (!refund) return apiFail('NOT_FOUND', 'Refund request not found', 404);

  const { data: evidence, error } = await service.rpc('get_event_refund_evidence', { p_refund: refund.id });
  if (error || !evidence || typeof evidence !== 'object' || typeof (evidence as { version?: unknown }).version !== 'string') {
    return apiFail('DB_ERROR', 'Unable to load refund evidence', 500);
  }
  return apiOk({ evidence });
}
