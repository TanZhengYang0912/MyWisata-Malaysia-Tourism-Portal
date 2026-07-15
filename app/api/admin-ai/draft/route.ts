// P4 — Member 4: admin message drafting. CLAUDE-ADMIN-AI.md Part 2, Capability 2.
// POST /api/admin-ai/draft — body { type, context }. Gated on super_admin,
// checked server-side. Pure generation, no data access, no send — the admin
// edits and sends manually.

import { createClient } from '@/lib/supabase/server';
import { apiOk, apiFail, parseBody } from '@/lib/validation/schemas';
import { adminAiDraftSchema } from '@/lib/validation/admin-ai-schemas';
import { isSuperAdmin } from '@/lib/affiliate/admin-guard';
import { generateDraft } from '@/lib/admin-ai/draft';

export async function POST(request: Request) {
  const parsed = await parseBody(request, adminAiDraftSchema);
  if (!parsed.ok) return parsed.response;

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return apiFail('UNAUTHORIZED', 'Sign in required', 401);
  if (!(await isSuperAdmin(supabase, user.id))) {
    return apiFail('FORBIDDEN', 'Admin AI is limited to super admins', 403);
  }

  try {
    const draft = await generateDraft(parsed.data.type, parsed.data.context);
    return apiOk({ draft });
  } catch (error) {
    console.error('[admin-ai] draft generation failed', error instanceof Error ? error.message : error);
    return apiFail('ASSISTANT_UNAVAILABLE', 'The AI assistant is unavailable right now — try again shortly.', 503);
  }
}
