// P4 — Member 4: moderation flags list. CLAUDE-MODERATION.md.
// GET /api/admin/moderation/flags — every slur flag across chatbot messages
// and tickets, newest first. Same admin gate as the rest of the support/
// affiliate admin surface.

import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';
import { apiOk, apiFail } from '@/lib/validation/schemas';
import { isSuperAdmin } from '@/lib/affiliate/admin-guard';
import { getModerationFlagPage } from '@/lib/moderation/flags';
import { z } from 'zod';

const querySchema = z.object({
  page: z.coerce.number().int().min(1).max(100000).default(1),
  pageSize: z.coerce.number().int().refine((value) => [10, 25, 50].includes(value)).default(10),
  showReviewed: z.enum(['true', 'false']).default('false'),
  groupKey: z.string().min(1).max(200).optional(),
});

export async function GET(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return apiFail('UNAUTHORIZED', 'Sign in required', 401);
  if (!(await isSuperAdmin(supabase, user.id))) {
    return apiFail('FORBIDDEN', 'Only Super Admin can view moderation flags', 403);
  }

  const parsed = querySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams));
  if (!parsed.success) return apiFail('VALIDATION_FAILED', 'Invalid moderation flag filters', 422);
  const pageSize = parsed.data.groupKey ? Math.min(parsed.data.pageSize, 25) : parsed.data.pageSize;

  // Service role bypasses RLS, so keep this read behind the Super Admin gate.
  try {
    const result = await getModerationFlagPage(createServiceClient(), {
      page: parsed.data.page,
      pageSize,
      showReviewed: parsed.data.showReviewed === 'true',
      groupKey: parsed.data.groupKey,
    });
    return apiOk(result);
  } catch {
    return apiFail('DB_ERROR', 'Unable to load moderation flags', 500);
  }
}
