import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';
import { apiFail, apiOk, parseBody, walletApproverPatchSchema } from '@/lib/validation/schemas';
import { moderateWalletAction } from '@/lib/wallet/moderation-guard';
import { walletReasonSchema } from '@/lib/validation/wallet-reason-schemas';

type EligibleUser = { id: string; email: string; name: string };

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

export async function GET(request: Request) {
  const { response } = await requireSuperAdmin();
  if (response) return response;
  const query = new URL(request.url).searchParams;
  const page = Number(query.get('page') ?? 1);
  const pageSize = Number(query.get('pageSize') ?? 10);
  const search = (query.get('search') ?? '').trim();
  if (!Number.isInteger(page) || page < 1 || page > 100000 || ![10, 25, 50].includes(pageSize) || search.length > 200) {
    return apiFail('VALIDATION_FAILED', 'Invalid Wallet Approver filters', 422);
  }
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
  const { data: candidatePage, error: candidateError } = await service.rpc('list_wallet_approver_candidates', {
    p_search: search,
    p_page: page,
    p_page_size: pageSize,
  });
  if (candidateError || !candidatePage || typeof candidatePage !== 'object') {
    return apiFail('APPROVERS_LOAD_FAILED', 'Unable to load eligible Wallet Approver candidates', 500);
  }
  const candidateData = candidatePage as { eligibleUsers?: EligibleUser[]; total?: number };
  if (!Array.isArray(candidateData.eligibleUsers) || typeof candidateData.total !== 'number') {
    return apiFail('APPROVERS_LOAD_FAILED', 'Unable to load eligible Wallet Approver candidates', 500);
  }
  return apiOk({ items, eligibleUsers: candidateData.eligibleUsers, page, pageSize, total: candidateData.total });
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
