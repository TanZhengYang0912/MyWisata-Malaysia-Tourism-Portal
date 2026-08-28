import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';
import { apiFail, apiOk, parseBody, walletApproverPatchSchema } from '@/lib/validation/schemas';
import { moderateWalletAction } from '@/lib/wallet/moderation-guard';
import { walletReasonSchema } from '@/lib/validation/wallet-reason-schemas';

async function requireSuperAdmin() {
  const db = await createClient();
  const { data: { user } } = await db.auth.getUser();
  if (!user) return { db, user: null, response: apiFail('UNAUTHORIZED', 'Sign in required', 401) };
  const { data, error } = await db.rpc('is_super_admin', { uid: user.id });
  if (error || !data) return { db, user, response: apiFail('FORBIDDEN', 'Super Admin access required', 403) };
  return { db, user, response: null };
}

async function getRoleId(service: ReturnType<typeof createServiceClient>, name: string) {
  const { data, error } = await service.from('roles').select('id').eq('name', name).maybeSingle();
  if (error || !data) throw new Error('role_not_configured');
  return data.id as number;
}

export async function GET() {
  const { response } = await requireSuperAdmin();
  if (response) return response;
  const service = createServiceClient();
  let approverRoleId: number;
  try { approverRoleId = await getRoleId(service, 'approver'); }
  catch { return apiFail('APPROVERS_LOAD_FAILED', 'Wallet Approver role is not configured', 503); }

  const { data: assignments, error } = await service.from('user_roles')
    .select('user_id,created_at')
    .eq('role_id', approverRoleId)
    .is('vendor_id', null)
    .is('outlet_id', null);
  if (error) return apiFail('APPROVERS_LOAD_FAILED', 'Unable to load Wallet Approvers', 500);
  const ids = [...new Set((assignments ?? []).map((row) => row.user_id))];
  const { data: users, error: usersError } = ids.length
    ? await service.from('users').select('id,email,full_name,display_name,status,created_at').in('id', ids)
    : { data: [], error: null };
  if (usersError) return apiFail('APPROVERS_LOAD_FAILED', 'Unable to load Wallet Approvers', 500);
  const created = new Map((assignments ?? []).map((row) => [row.user_id, row.created_at]));
  const items = (users ?? []).map((user) => ({
    id: user.id, email: user.email, name: user.full_name ?? user.display_name ?? user.email,
    accountStatus: user.status, active: user.status === 'active', grantedAt: created.get(user.id) ?? null,
  }));
  const { data: activeUsers } = await service.from('users')
    .select('id,email,full_name,display_name,status').eq('status', 'active').order('created_at', { ascending: false }).limit(100);
  const eligibleIds = new Set(ids);
  let superAdminRoleId: number;
  try { superAdminRoleId = await getRoleId(service, 'super_admin'); }
  catch { return apiFail('APPROVERS_LOAD_FAILED', 'Super Admin role is not configured', 503); }
  const { data: superAssignments } = await service.from('user_roles')
    .select('user_id')
    .eq('role_id', superAdminRoleId)
    .is('vendor_id', null)
    .is('outlet_id', null);
  for (const row of superAssignments ?? []) eligibleIds.add(row.user_id);
  const eligibleUsers = (activeUsers ?? []).filter((user) => !eligibleIds.has(user.id)).map((user) => ({
    id: user.id, email: user.email, name: user.full_name ?? user.display_name ?? user.email,
  }));
  return apiOk({ items, eligibleUsers });
}

export async function PATCH(request: Request) {
  const { db, user: actor, response } = await requireSuperAdmin();
  if (response) return response;
  if (!actor) return apiFail('UNAUTHORIZED', 'Sign in required', 401);
  const parsed = await parseBody(request, walletApproverPatchSchema);
  if (!parsed.ok) return parsed.response;
  if (parsed.data.userId === actor.id) return apiFail('SELF_ROLE_CHANGE', 'You cannot change your own Wallet Approver role', 403);
  const action = parsed.data.action === 'grant' ? 'approver_role' : 'approver_role';
  const validated = walletReasonSchema.safeParse({ action, reason: parsed.data.reason, reasonCategory: parsed.data.reasonCategory });
  if (!validated.success) return apiFail('VALIDATION_FAILED', validated.error.issues[0]?.message ?? 'Invalid role-change reason', 422);
  const moderation = await moderateWalletAction({ actorId: actor.id, action, reasonCategory: validated.data.reasonCategory, reason: validated.data.reason });
  if (!moderation.ok) return apiFail(moderation.code, moderation.message, moderation.code === 'MODERATION_UNAVAILABLE' ? 503 : moderation.code === 'RATE_LIMITED' ? 429 : 422);

  const { data, error } = await db.rpc('manage_wallet_approver', {
    p_target_user_id: parsed.data.userId,
    p_action: parsed.data.action,
    p_reason_category: validated.data.reasonCategory,
    p_note: validated.data.reason,
  });
  if (error) {
    if (error.message.includes('last_approver')) return apiFail('LAST_APPROVER', 'The last active Wallet Approver cannot be removed', 409);
    if (error.message.includes('target_not_found')) return apiFail('NOT_FOUND', 'User not found', 404);
    if (error.message.includes('target_not_active')) return apiFail('INVALID_STATE', 'Only active users can become Wallet Approvers', 409);
    if (error.message.includes('self_role_change')) return apiFail('SELF_ROLE_CHANGE', 'You cannot change your own Wallet Approver role', 403);
    if (error.message.includes('privileged_target')) return apiFail('PRIVILEGED_TARGET', 'Super Admin role cannot be changed here', 403);
    if (error.message.includes('roles_not_configured')) return apiFail('APPROVERS_NOT_CONFIGURED', 'Required roles are not configured', 503);
    if (error.message.includes('super_admin_required')) return apiFail('FORBIDDEN', 'Super Admin access required', 403);
    return apiFail('ROLE_UPDATE_FAILED', 'Unable to change Wallet Approver role', 500);
  }
  return apiOk(data);
}
