// PATCH  /api/admin/moderation-words/[id] — toggle active/inactive
// DELETE /api/admin/moderation-words/[id] — remove a custom word
// Gated on super_admin, checked server-side.

import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';
import { parseBody, apiOk, apiFail } from '@/lib/validation/schemas';
import { updateCustomWordSchema } from '@/lib/validation/moderation-schemas';
import { isSuperAdmin } from '@/lib/affiliate/admin-guard';
import { removeCustomWord, setCustomWordActive } from '@/lib/moderation/custom-words';

interface Props {
  params: Promise<{ id: string }>;
}

async function requireSuperAdmin(): Promise<{ error: Response } | { ok: true }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: apiFail('UNAUTHORIZED', 'Sign in required', 401) };
  if (!(await isSuperAdmin(supabase, user.id))) {
    return { error: apiFail('FORBIDDEN', 'Only Super Admin can edit the moderation word list', 403) };
  }
  return { ok: true as const };
}

export async function PATCH(request: Request, { params }: Props): Promise<Response> {
  const auth = await requireSuperAdmin();
  if ('error' in auth) return auth.error;

  const { id } = await params;
  const parsed = await parseBody(request, updateCustomWordSchema);
  if (!parsed.ok) return parsed.response;

  await setCustomWordActive(createServiceClient(), id, parsed.data.isActive);
  return apiOk({ id });
}

export async function DELETE(_request: Request, { params }: Props): Promise<Response> {
  const auth = await requireSuperAdmin();
  if ('error' in auth) return auth.error;

  const { id } = await params;
  await removeCustomWord(createServiceClient(), id);
  return apiOk({ id });
}
