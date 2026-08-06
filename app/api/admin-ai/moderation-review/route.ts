// P4 — Member 4: moderation assistant. CLAUDE-ADMIN-AI.md Part 2, Capability 3.
// POST /api/admin-ai/moderation-review — body { recommendationId }. Gated on
// super_admin. READ-ONLY overlay on vendor_recommendations (another
// member's table) — this route never writes to it. The cookie-aware client
// authenticates and authorizes first; service-role access is created only
// after the Super Admin check for private recommendation evidence.

import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';
import { apiOk, apiFail, parseBody } from '@/lib/validation/schemas';
import { adminAiModerationReviewSchema } from '@/lib/validation/admin-ai-schemas';
import { isSuperAdmin } from '@/lib/affiliate/admin-guard';
import { reviewRecommendation } from '@/lib/admin-ai/moderation';

export async function POST(request: Request) {
  const parsed = await parseBody(request, adminAiModerationReviewSchema);
  if (!parsed.ok) return parsed.response;

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return apiFail('UNAUTHORIZED', 'Sign in required', 401);
  if (!(await isSuperAdmin(supabase, user.id))) {
    return apiFail('FORBIDDEN', 'Admin AI is limited to super admins', 403);
  }

  try {
    const service = createServiceClient();
    const assessment = await reviewRecommendation(service, parsed.data.recommendationId);
    return apiOk(assessment);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'unknown_error';
    if (message === 'recommendation_not_found') return apiFail('NOT_FOUND', 'Recommendation not found', 404);
    console.error('[admin-ai] moderation review failed', message);
    return apiFail('ASSISTANT_UNAVAILABLE', 'The AI assistant is unavailable right now — try again shortly.', 503);
  }
}
