import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';
import { apiFail, apiOk, parseBody, walletApproverPatchSchema } from '@/lib/validation/schemas';
import { moderateWalletAction } from '@/lib/wallet/moderation-guard';
import { walletReasonSchema } from '@/lib/validation/wallet-reason-schemas';

async function requireSuperAdmin() {
  const db = await createClient();
  const { data: { user } } = await db.auth.getUser();
  if (!user) return { user: null, response: apiFail('UNAUTHORIZED', 'Sign in required', 401) };
  const { data, error } = await db.rpc('is_super_admin', { uid: user.id });
  if (error || !data) return { user, response: apiFail('FORBIDDEN', 'Super Admin access required', 403) };
  return { user, response: null };
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
    .select('user_id,created_at').eq('role_id', approverRoleId);
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
  const { data: superAssignments } = await service.from('user_roles').select('user_id').eq('role_id', superAdminRoleId);
  for (const row of superAssignments ?? []) eligibleIds.add(row.user_id);
  const eligibleUsers = (activeUsers ?? []).filter((user) => !eligibleIds.has(user.id)).map((user) => ({
    id: user.id, email: user.email, name: user.full_name ?? user.display_name ?? user.email,
  }));
  return apiOk({ items, eligibleUsers });
}

export async function PATCH(request: Request) {
  const { user: actor, response } = await requireSuperAdmin();
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

  const service = createServiceClient();
  let approverRoleId: number;
  let superAdminRoleId: number;
  try {
    approverRoleId = await getRoleId(service, 'approver');
    superAdminRoleId = await getRoleId(service, 'super_admin');
  } catch { return apiFail('APPROVERS_NOT_CONFIGURED', 'Required roles are not configured', 503); }
  const { data: target, error: targetError } = await service.from('users').select('id,email,status').eq('id', parsed.data.userId).maybeSingle();
  if (targetError || !target) return apiFail('NOT_FOUND', 'User not found', 404);
  if (parsed.data.action === 'grant' && target.status !== 'active') return apiFail('INVALID_STATE', 'Only active users can become Wallet Approvers', 409);
  const { data: privileged } = await service.from('user_roles').select('id').eq('user_id', target.id).eq('role_id', superAdminRoleId).maybeSingle();
  if (privileged) return apiFail('PRIVILEGED_TARGET', 'Super Admin role cannot be changed here', 403);
  const { data: existing } = await service.from('user_roles').select('id').eq('user_id', target.id).eq('role_id', approverRoleId).maybeSingle();

  if (parsed.data.action === 'grant') {
    if (!existing) {
      const { error } = await service.from('user_roles').insert({ user_id: target.id, role_id: approverRoleId });
      if (error) return apiFail('ROLE_UPDATE_FAILED', 'Unable to grant Wallet Approver role', 500);
    }
  } else if (existing) {
    const { data: assignments } = await service.from('user_roles').select('user_id').eq('role_id', approverRoleId);
    const ids = [...new Set((assignments ?? []).map((row) => row.user_id))];
    const { data: activeUsers } = ids.length ? await service.from('users').select('id,status').in('id', ids) : { data: [] };
    if ((activeUsers ?? []).filter((user) => user.status === 'active').length <= 1 && target.status === 'active') {
      return apiFail('LAST_APPROVER', 'The last active Wallet Approver cannot be removed', 409);
    }
    const { error } = await service.from('user_roles').delete().eq('user_id', target.id).eq('role_id', approverRoleId).is('vendor_id', null).is('outlet_id', null);
    if (error) return apiFail('ROLE_UPDATE_FAILED', 'Unable to revoke Wallet Approver role', 500);
  }
  const granted = parsed.data.action === 'grant';
  await service.from('audit_logs').insert({
    actor_id: actor.id, action: `wallet.approver_${granted ? 'granted' : 'revoked'}`,
    entity_type: 'user', entity_id: target.id, before_data: { approver: Boolean(existing) },
    after_data: { approver: granted }, note: parsed.data.reason,
  });
  await service.from('notifications').insert({
    user_id: target.id, type: granted ? 'wallet_approver_granted' : 'wallet_approver_revoked',
    title: granted ? 'Wallet Approver access granted' : 'Wallet Approver access revoked',
    body: granted ? 'You can now review wallet withdrawals.' : 'Your Wallet Approver access has been revoked.', link: '/admin/withdrawals',
  });
  return apiOk({ userId: target.id, approver: granted, action: parsed.data.action });
}
