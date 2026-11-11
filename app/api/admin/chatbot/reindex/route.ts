import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';
import { apiOk, apiFail } from '@/lib/validation/schemas';
import { isSuperAdmin } from '@/lib/affiliate/admin-guard';
import { embedText } from '@/lib/chatbot/embed';
import { reserveAiQuota } from '@/lib/rate-limit/ai';

const REINDEX_BATCH_SIZE = 10;
const reindexSchema = z.object({ documentId: z.string().uuid().optional() }).strict();

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return apiFail('UNAUTHORIZED', 'Sign in required', 401);
  if (!(await isSuperAdmin(supabase, user.id))) {
    return apiFail('FORBIDDEN', 'Only Super Admin can reindex the knowledge base', 403);
  }
  if (!process.env.LLM_API_KEY) {
    return apiFail('NOT_CONFIGURED', 'Knowledge-base indexing is temporarily unavailable. Please try again later.', 503);
  }

  let documentId: string | null = null;
  if (request.headers.get('content-type')?.includes('application/json')) {
    const rawBody = await request.json().catch(() => null);
    if (rawBody === null) return apiFail('INVALID_INPUT', 'Choose a valid knowledge-base entry to retry.', 400);
    const parsedBody = reindexSchema.safeParse(rawBody);
    if (!parsedBody.success) return apiFail('INVALID_INPUT', 'Choose a valid knowledge-base entry to retry.', 400);
    documentId = parsedBody.data.documentId ?? null;
  }

  const service = createServiceClient();
  const { data: claimed, error: claimError } = await service.rpc('claim_chatbot_kb_reindex', {
    p_limit: REINDEX_BATCH_SIZE,
    p_lease_seconds: 300,
    p_document_id: documentId,
  });
  if (claimError) return apiFail('READ_UNAVAILABLE', 'Knowledge-base entries could not be claimed. Please try again later.', 503);

  let reindexed = 0;
  const errors: { id: string; error: string }[] = [];
  for (const doc of (claimed ?? []) as { id: string; title: string; body: string; content_version: number; lease_token: string }[]) {
    const quotaAvailable = await reserveAiQuota(request, 'kb_embedding', user.id).catch(() => false);
    if (!quotaAvailable) {
      await service.rpc('release_chatbot_kb_reindex', { p_id: doc.id, p_lease_token: doc.lease_token });
      errors.push({ id: doc.id, error: 'AI indexing quota is temporarily unavailable. Retry this batch later.' });
      continue;
    }
    try {
      const embedding = await embedText(`${doc.title}\n${doc.body}`, 'kb');
      const { data: updated, error: finishError } = await service.rpc('finish_chatbot_kb_reindex', {
        p_id: doc.id,
        p_content_version: doc.content_version,
        p_lease_token: doc.lease_token,
        p_embedding: embedding,
      });
      if (finishError || updated !== true) throw new Error('index_version_changed');
      reindexed += 1;
    } catch {
      await service.rpc('release_chatbot_kb_reindex', { p_id: doc.id, p_lease_token: doc.lease_token });
      errors.push({ id: doc.id, error: 'This entry could not be indexed. Retry the indexing task later.' });
    }
  }

  return apiOk({ scanned: (claimed ?? []).length, reindexed, skipped: 0, errors, batchSize: REINDEX_BATCH_SIZE });
}
