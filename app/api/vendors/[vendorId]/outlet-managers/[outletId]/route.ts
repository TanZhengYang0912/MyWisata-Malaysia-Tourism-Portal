import { apiFail, apiOk } from '@/lib/validation/schemas';
import { authorizeVendor } from '@/lib/vendor-authorization';

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
  const { error: deleteAssignmentError } = await db.from('outlet_managers').delete().eq('outlet_id', outletId);
  if (deleteAssignmentError) return apiFail('DB_ERROR', deleteAssignmentError.message, 500);
  if (role) {
    const { error: deleteRoleError } = await db.from('user_roles').delete().eq('user_id', assignment.user_id).eq('role_id', role.id).eq('outlet_id', outletId);
    if (deleteRoleError) return apiFail('DB_ERROR', deleteRoleError.message, 500);
  }
  return apiOk({ outletId, userId: assignment.user_id });
}
