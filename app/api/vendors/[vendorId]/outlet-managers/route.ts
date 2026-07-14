import { z } from 'zod';
import { apiFail, apiOk, parseBody } from '@/lib/validation/schemas';
import { authorizeVendor } from '@/lib/vendor-authorization';

interface Props { params: Promise<{ vendorId: string }> }

const assignmentSchema = z.object({ outletId: z.string().uuid(), userId: z.string().uuid() }).strict();

export async function GET(_request: Request, { params }: Props) {
  const { vendorId } = await params;
  const access = await authorizeVendor(vendorId, ['vendor_owner']);
  if (!access.ok) return access.response;
  const db = access.access.serviceDb;

  const { data: outlets, error: outletError } = await db.from('outlets').select('id,name,city,state').eq('vendor_id', vendorId).order('name');
  if (outletError) return apiFail('DB_ERROR', outletError.message, 500);
  const outletIds = (outlets || []).map((outlet: { id: string; name: string; city: string; state: string; [key: string]: unknown }) => outlet.id);

  const [{ data: assignments, error: assignmentError }, { data: role, error: roleError }] = await Promise.all([
    db.from('outlet_managers').select('outlet_id,user_id,users(id,full_name,email)').in('outlet_id', outletIds.length ? outletIds : ['none']),
    db.from('roles').select('id').eq('name', 'outlet_manager').maybeSingle(),
  ]);
  if (assignmentError || roleError) return apiFail('DB_ERROR', (assignmentError || roleError)?.message || 'Unknown error', 500);

  const { data: roleUsers, error: roleUsersError } = role
    ? await db.from('user_roles').select('user_id,users(id,full_name,email)').eq('role_id', role.id)
    : { data: [], error: null };
  if (roleUsersError) return apiFail('DB_ERROR', roleUsersError.message, 500);

  const normalizeUser = (value: { id: string; full_name: string; email: string } | { id: string; full_name: string; email: string }[] | null | undefined) => {
    const user = Array.isArray(value) ? value[0] : value;
    return user ? { id: user.id, fullName: user.full_name, email: user.email } : null;
  };
  const assignmentsByOutlet = new Map((assignments || []).map((assignment: { outlet_id: string; user_id: string; users: { id: string; full_name: string; email: string } | { id: string; full_name: string; email: string }[] | null }) => [assignment.outlet_id, {
    userId: assignment.user_id,
    user: normalizeUser(assignment.users),
  }]));
  const eligibleManagers = [...new Map((roleUsers || []).map((row: { users: { id: string; full_name: string; email: string } | { id: string; full_name: string; email: string }[] | null }) => {
    const user = normalizeUser(row.users);
    return user ? [user.id, user] : null;
  }).filter(Boolean) as Array<[string, { id: string; fullName: string; email: string }]>).values()];

  return apiOk({
    outlets: (outlets || []).map((outlet: { id: string; name: string; city: string; state: string; [key: string]: unknown }) => ({ ...outlet, manager: assignmentsByOutlet.get(outlet.id) || null })),
    eligibleManagers,
  });
}

export async function POST(request: Request, { params }: Props) {
  const { vendorId } = await params;
  const access = await authorizeVendor(vendorId, ['vendor_owner']);
  if (!access.ok) return access.response;
  const parsed = await parseBody(request, assignmentSchema);
  if (!parsed.ok) return parsed.response;
  const { outletId, userId } = parsed.data;
  const db = access.access.serviceDb;

  const [{ data: outlet }, { data: role }] = await Promise.all([
    db.from('outlets').select('id').eq('id', outletId).eq('vendor_id', vendorId).maybeSingle(),
    db.from('roles').select('id').eq('name', 'outlet_manager').maybeSingle(),
  ]);
  if (!outlet) return apiFail('INVALID_OUTLET', 'Outlet not found in this vendor', 400);
  if (!role) return apiFail('DB_ERROR', 'Outlet Manager role is not configured', 500);

  const [{ data: userRole }, { data: outletAssignment }, { data: userAssignment }] = await Promise.all([
    db.from('user_roles').select('user_id').eq('user_id', userId).eq('role_id', role.id).maybeSingle(),
    db.from('outlet_managers').select('user_id').eq('outlet_id', outletId).maybeSingle(),
    db.from('outlet_managers').select('outlet_id').eq('user_id', userId).maybeSingle(),
  ]);
  if (!userRole) return apiFail('FORBIDDEN', 'The selected account is not an Outlet Manager', 400);
  if (outletAssignment && outletAssignment.user_id !== userId) return apiFail('CONFLICT', 'This outlet already has an Outlet Manager', 409);
  if (userAssignment && userAssignment.outlet_id !== outletId) return apiFail('CONFLICT', 'This manager is already assigned to another outlet', 409);

  const { error: assignmentError } = await db.from('outlet_managers').upsert({ outlet_id: outletId, user_id: userId }, { onConflict: 'outlet_id' });
  if (assignmentError) return apiFail('DB_ERROR', assignmentError.message, 400);
  const { error: roleError } = await db.from('user_roles').upsert({ user_id: userId, role_id: role.id, vendor_id: vendorId, outlet_id: outletId }, { onConflict: 'user_id,role_id,vendor_id,outlet_id' });
  if (roleError) return apiFail('DB_ERROR', roleError.message, 400);
  return apiOk({ outletId, userId });
}
