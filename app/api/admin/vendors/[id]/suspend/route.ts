// P2 — Member 2 owns B1: Admin suspend/unsuspend vendor

import { createClient } from '@/lib/supabase/server';
import { auditAndNotify } from '@/lib/audit';
import { parseBody, apiOk, apiFail } from '@/lib/validation/schemas';
import { vendorSuspendSchema } from '@/lib/validation/vendor-schemas';

interface Props { params: Promise<{ id: string }> }

export async function POST(request: Request, { params }: Props) {
  const { id: vendorId } = await params;
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return apiFail('UNAUTHORIZED', 'Sign in required', 401);

  // Role check
  const { data: roles } = await supabase
    .from('user_roles')
    .select('roles(name)')
    .eq('user_id', user.id);

  const roleNames = (roles ?? []).map(r => (r.roles as Record<string, any>)?.name as string);
  if (!roleNames.includes('super_admin')) {
    return apiFail('FORBIDDEN', 'Only super admin can suspend vendors', 403);
  }

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

  const { error } = await supabase
    .from('vendors')
    .update({ status: newStatus })
    .eq('id', vendorId);

  if (error) return apiFail('DB_ERROR', error.message, 500);

  await auditAndNotify(
    {
      action: `vendor.${action}ed`,
      entityType: 'vendor',
      entityId: vendorId,
      beforeData: { status: vendor.status },
      afterData: { status: newStatus },
      note: reason,
    },
    [{
      userId: vendor.owner_id,
      type: `vendor_${action}ed`,
      title: action === 'suspend'
        ? `Your vendor "${vendor.name}" has been suspended`
        : `Your vendor "${vendor.name}" has been reactivated`,
      body: reason ?? undefined,
      link: '/vendor/dashboard',
    }],
  );

  return apiOk({ id: vendorId, status: newStatus });
}
