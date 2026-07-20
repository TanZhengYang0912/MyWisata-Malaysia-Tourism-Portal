import { apiFail, apiOk } from '@/lib/validation/schemas';
import { authorizeVendor } from '@/lib/vendor-authorization';
import { emitVendorNotification } from '@/lib/vendor-notifications/emit';

interface Props { params: Promise<{ vendorId: string; outletId: string }> }

export async function DELETE(_request: Request, { params }: Props) {
  const { vendorId, outletId } = await params;
  const access = await authorizeVendor(vendorId, ['vendor_owner']);
  if (!access.ok) return access.response;
  const db = access.access.serviceDb;

  const { data: assignment, error: assignmentLookupError } = await db.from('outlet_managers').select('user_id').eq('outlet_id', outletId).maybeSingle();
  if (assignmentLookupError) return apiFail('DB_ERROR', assignmentLookupError.message, 500);
  if (!assignment) return apiFail('NOT_FOUND', 'No manager is assigned to this outlet', 404);

  const { data: role } = await db.from('roles').select('id').eq('name', 'outlet_manager').maybeSingle();
  // Emit before deleting the assignment so the affected manager is still in
  // the scoped recipient set. The notification itself is idempotent.
  void emitVendorNotification({
    eventKey: `manager:revoke:${vendorId}:${outletId}:${assignment.user_id}`,
    vendorId,
    outletId,
    audience: 'owner_and_assigned_outlet',
    category: 'vendor_account',
    type: 'vendor_manager_permission_revoked',
    title: 'Outlet Manager access removed',
    body: 'Your Outlet Manager access for this outlet was removed.',
    link: `/vendor/${vendorId}/settings/managers`,
    email: true,
    reference: outletId,
    metadata: { action: 'revoke' },
    serviceDb: db,
  }).catch((notificationError) => console.error('[vendor-notifications] manager revoke event failed', notificationError));
  const { error: deleteAssignmentError } = await db.from('outlet_managers').delete().eq('outlet_id', outletId);
  if (deleteAssignmentError) return apiFail('DB_ERROR', deleteAssignmentError.message, 500);
  if (role) {
    const { error: deleteRoleError } = await db.from('user_roles').delete().eq('user_id', assignment.user_id).eq('role_id', role.id).eq('outlet_id', outletId);
    if (deleteRoleError) return apiFail('DB_ERROR', deleteRoleError.message, 500);
  }
  return apiOk({ outletId, userId: assignment.user_id });
}
