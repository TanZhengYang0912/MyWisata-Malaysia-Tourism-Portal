// P4 — Member 4: KB re-embedding (CLAUDE-PHASE2.md Feature A)
// POST /api/admin/chatbot/reindex — embeds every active KB doc whose
// embedded_at is null or older than updated_at. Idempotent: a doc already
// embedded since its last edit is skipped. Gated on super_admin,
// checked server-side. Also called automatically by the KB editor's save
// handler for the single doc just saved — this route exists for bulk
// catch-up (e.g. after the migration first adds the embedding column, or if
// a per-save embed failed because LLM_API_KEY was added later).

import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';
import { apiOk, apiFail } from '@/lib/validation/schemas';
import { isSuperAdmin } from '@/lib/affiliate/admin-guard';
import { embedText } from '@/lib/chatbot/embed';

export async function POST() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return apiFail('UNAUTHORIZED', 'Sign in required', 401);
  if (!(await isSuperAdmin(supabase, user.id))) {
    return apiFail('FORBIDDEN', 'Only Super Admin can reindex the knowledge base', 403);
  }
  if (!process.env.LLM_API_KEY) {
    return apiFail('NOT_CONFIGURED', 'Knowledge-base indexing is temporarily unavailable. Please try again later.', 503);
  }

  const service = createServiceClient();
  const { data: docs, error } = await service
    .from('chatbot_kb_documents')
    .select('id, title, body, embedded_at, updated_at')
    .eq('is_active', true);
  if (error) {
    console.error('[admin/chatbot/reindex] document lookup failed');
    return apiFail('DB_ERROR', 'Knowledge-base entries could not be loaded. Please try again later.', 500);
  }

  const stale = (docs ?? []).filter((d) => !d.embedded_at || new Date(d.embedded_at) < new Date(d.updated_at));

  let reindexed = 0;
  const errors: { id: string; error: string }[] = [];

  for (const doc of stale) {
    try {
      const embedding = await embedText(`${doc.title}\n${doc.body}`);
      const { error: updateErr } = await service
        .from('chatbot_kb_documents')
        .update({ embedding, embedded_at: new Date().toISOString() })
        .eq('id', doc.id);
      if (updateErr) throw updateErr;
      reindexed += 1;
    } catch (_err) {
      errors.push({ id: doc.id, error: 'This entry could not be indexed. Retry the indexing task later.' });
    }
  }

  return apiOk({ scanned: (docs ?? []).length, reindexed, skipped: (docs?.length ?? 0) - stale.length, errors });
}
