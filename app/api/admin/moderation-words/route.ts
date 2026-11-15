// GET  /api/admin/moderation-words — every custom word (active + inactive)
// POST /api/admin/moderation-words — add a word to the list
// Gated on super_admin, checked server-side. See lib/moderation/custom-words.ts.

import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';
import { parseBody, apiOk, apiFail } from '@/lib/validation/schemas';
import { addCustomWordSchema } from '@/lib/validation/moderation-schemas';
import { isSuperAdmin } from '@/lib/affiliate/admin-guard';
import { addCustomWord, listCustomWords } from '@/lib/moderation/custom-words';
import { z } from 'zod';

const listQuerySchema = z.object({
  page: z.coerce.number().int().min(1).max(100000).default(1),
  pageSize: z.coerce.number().int().refine((value) => [10, 25, 50].includes(value)).default(10),
  search: z.string().trim().max(200).default(''),
});

export async function GET(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return apiFail('UNAUTHORIZED', 'Sign in required', 401);
  if (!(await isSuperAdmin(supabase, user.id))) {
    return apiFail('FORBIDDEN', 'Only Super Admin can view the moderation word list', 403);
  }

  const parsedQuery = listQuerySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams));
  if (!parsedQuery.success) return apiFail('VALIDATION_FAILED', 'Invalid moderation word list filters', 422);
  try {
    const result = await listCustomWords(createServiceClient(), parsedQuery.data);
    return apiOk({ ...result, page: parsedQuery.data.page, pageSize: parsedQuery.data.pageSize });
  } catch {
    return apiFail('DB_ERROR', 'Unable to load moderation words', 500);
  }
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return apiFail('UNAUTHORIZED', 'Sign in required', 401);
  if (!(await isSuperAdmin(supabase, user.id))) {
    return apiFail('FORBIDDEN', 'Only Super Admin can edit the moderation word list', 403);
  }

  const parsed = await parseBody(request, addCustomWordSchema);
  if (!parsed.ok) return parsed.response;

  const result = await addCustomWord(createServiceClient(), { ...parsed.data, createdBy: user.id });
  if (!result.ok) return apiFail('VALIDATION_FAILED', result.error, 422);

  return apiOk(result.word);
}
