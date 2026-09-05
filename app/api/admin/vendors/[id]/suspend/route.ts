// P2 — Member 2 owns B1: Admin suspend/unsuspend vendor

import { sendNotification } from '@/lib/audit';
import { parseBody, apiOk, apiFail } from '@/lib/validation/schemas';
import { vendorSuspendSchema } from '@/lib/validation/vendor-schemas';
import { createServiceClient } from '@/lib/supabase/service';
import { requireStaffPermission } from '@/lib/staff-permissions/server';
import { emitVendorNotification } from '@/lib/vendor-notifications/emit';

interface Props { params: Promise<{ id: string }> }

export async function POST(request: Request, { params }: Props) {
  const { id: vendorId } = await params;
  const { db: supabase, user, response } = await requireStaffPermission('admin.vendor.manage');
  if (response) return response;
  if (!user) return apiFail('UNAUTHORIZED', 'Sign in required', 401);

  const parsed = await parseBody(request, vendorSuspendSchema);
  if (!parsed.ok) return parsed.response;
  const { action, reason } = parsed.data;

  const { data: vendor } = await supabase
    .from('vendors')
    .select('*')
    .eq('id', vendorId)
    .single();

  if (!vendor) return apiFail('NOT_FOUND', 'Vendor not found', 404);

  if (action === 'suspend' && vendor.status !== 'approved') {
    return apiFail('INVALID_STATE', 'Only approved vendors can be suspended', 400);
  }
  if (action === 'unsuspend' && vendor.status !== 'suspended') {
    return apiFail('INVALID_STATE', 'Only suspended vendors can be unsuspended', 400);
  }

  const newStatus = action === 'suspend' ? 'suspended' : 'approved';

  const { data: statusData, error } = await supabase.rpc('staff_set_vendor_suspension', {
    p_vendor_id: vendorId,
    p_action: action,
    p_reason: reason ?? null,
  });

  if (error) {
    const message = error.message ?? '';
    if (message.includes('vendor_permission_required')) return apiFail('FORBIDDEN', 'Vendor management permission required', 403);
    if (message.includes('vendor_not_found')) return apiFail('NOT_FOUND', 'Vendor not found', 404);
    if (message.includes('vendor_invalid_state')) return apiFail('INVALID_STATE', 'Vendor is not in a valid state for this action', 409);
    if (message.includes('vendor_suspension_action_invalid')) return apiFail('VALIDATION_FAILED', 'Vendor suspension action is invalid', 422);
    return apiFail('DB_ERROR', 'Vendor status could not be changed', 500);
  }
  if (!statusData) return apiFail('DB_ERROR', 'Vendor status change returned no result', 500);

  await sendNotification({
    userId: vendor.owner_id,
    type: `vendor_${action}ed`,
    title: action === 'suspend'
      ? `Your vendor "${vendor.name}" has been suspended`
      : `Your vendor "${vendor.name}" has been reactivated`,
    body: reason ?? undefined,
    link: '/vendor/dashboard',
  });

  void emitVendorNotification({
    eventKey: `vendor:${action}:${vendorId}`,
    vendorId,
    audience: 'owner',
    category: 'vendor_account',
    type: action === 'suspend' ? 'vendor_suspended' : 'vendor_unsuspended',
    title: action === 'suspend' ? `Vendor "${vendor.name}" suspended` : `Vendor "${vendor.name}" reactivated`,
    body: reason ?? (action === 'suspend' ? 'Your vendor account has been suspended.' : 'Your vendor account is active again.'),
    link: '/vendor/dashboard',
    email: true,
    reference: vendorId,
    metadata: { status: newStatus },
    serviceDb: createServiceClient(),
  }).catch((notificationError) => console.error('[vendor-notifications] vendor status event failed', notificationError));

  return apiOk({ id: vendorId, status: newStatus });
}
