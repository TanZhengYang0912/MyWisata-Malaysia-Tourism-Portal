import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';
import { apiFail, apiOk, parseBody } from '@/lib/validation/schemas';
import { cleanUserContent } from '@/lib/moderation/clean';

const surfaceSchema = z.enum(['handoff', 'ticket_create', 'ticket_reply']);
const targetSchema = z.string().trim().min(1).max(64).regex(/^[a-zA-Z0-9:_-]+$/);
const saveSchema = z.object({
  surface: surfaceSchema,
  target: targetSchema,
  subject: z.string().trim().max(255).default(''),
  body: z.string().trim().max(2000).default(''),
  expectedVersion: z.number().int().nonnegative(),
}).strict();

export async function GET(request: Request) {
  const auth = await createClient();
  const { data: { user } } = await auth.auth.getUser();
  if (!user) return apiFail('UNAUTHORIZED', 'Sign in to load this draft.', 401);
  const search = new URL(request.url).searchParams;
  const parsedSurface = surfaceSchema.safeParse(search.get('surface'));
  const parsedTarget = targetSchema.safeParse(search.get('target'));
  if (!parsedSurface.success || !parsedTarget.success) return apiFail('INVALID_INPUT', 'Choose a valid draft.', 400);

  const service = createServiceClient();
  const { data, error } = await service.from('support_drafts')
    .select('subject, body, version, updated_at')
    .eq('owner_id', user.id)
    .eq('surface', parsedSurface.data)
    .eq('target', parsedTarget.data)
    .maybeSingle();
  if (error) return apiFail('READ_UNAVAILABLE', 'Unable to load this draft.', 503);
  const response = apiOk(data ?? { subject: '', body: '', version: 0, updated_at: null });
  response.headers.set('Cache-Control', 'private, no-store');
  return response;
}

export async function PUT(request: Request) {
  const auth = await createClient();
  const { data: { user } } = await auth.auth.getUser();
  if (!user) return apiFail('UNAUTHORIZED', 'Sign in to save this draft.', 401);
  const parsed = await parseBody(request, saveSchema);
  if (!parsed.ok) return parsed.response;
  const service = createServiceClient();
  const [subject, body] = await Promise.all([
    cleanUserContent(parsed.data.subject, service),
    cleanUserContent(parsed.data.body, service),
  ]);
  const { data, error } = await service.rpc('save_support_draft', {
    p_owner_id: user.id,
    p_surface: parsed.data.surface,
    p_target: parsed.data.target,
    p_subject: subject.display,
    p_body: body.display,
    p_expected_version: parsed.data.expectedVersion,
  });
  if (error) return apiFail(error.message === 'support_draft_version_conflict' ? 'CONFLICT' : 'WRITE_UNAVAILABLE', 'Unable to save this draft.', error.message === 'support_draft_version_conflict' ? 409 : 503);
  if (!data || typeof data !== 'object') return apiFail('WRITE_UNAVAILABLE', 'Unable to confirm this draft was saved.', 503);
  const result = data as { version?: unknown; changed?: unknown };
  if (!Number.isInteger(result.version) || typeof result.changed !== 'boolean') return apiFail('WRITE_UNAVAILABLE', 'Unable to confirm this draft was saved.', 503);
  const response = apiOk({ version: result.version, changed: result.changed });
  response.headers.set('Cache-Control', 'private, no-store');
  return response;
}

export async function DELETE(request: Request) {
  const auth = await createClient();
  const { data: { user } } = await auth.auth.getUser();
  if (!user) return apiFail('UNAUTHORIZED', 'Sign in to clear this draft.', 401);
  const search = new URL(request.url).searchParams;
  const parsedSurface = surfaceSchema.safeParse(search.get('surface'));
  const parsedTarget = targetSchema.safeParse(search.get('target'));
  if (!parsedSurface.success || !parsedTarget.success) return apiFail('INVALID_INPUT', 'Choose a valid draft.', 400);
  const { error } = await createServiceClient().from('support_drafts').delete()
    .eq('owner_id', user.id)
    .eq('surface', parsedSurface.data)
    .eq('target', parsedTarget.data);
  if (error) return apiFail('WRITE_UNAVAILABLE', 'Unable to clear this draft.', 503);
  return apiOk({ cleared: true });
}
