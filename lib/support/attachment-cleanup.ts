import 'server-only';
import { z } from 'zod';
import { createServiceClient } from '@/lib/supabase/service';

const cleanupBatchSchema = z.object({
  token: z.string().uuid(),
  items: z.array(z.object({
    id: z.string().uuid(),
    storage_path: z.string().regex(/^[0-9a-f-]{36}\/[0-9a-f-]{36}\.(jpg|png|webp|pdf)$/i),
  }).strict()).max(50),
}).strict();

const cleanupResultSchema = z.object({
  deleted: z.number().int().nonnegative(),
  rescheduled: z.number().int().nonnegative(),
}).strict();

export async function cleanupSupportAttachments() {
  const service = createServiceClient();
  const { data, error } = await service.rpc('claim_support_attachment_cleanup');
  const parsed = cleanupBatchSchema.safeParse(data);
  if (error || !parsed.success) throw new Error('support_attachment_cleanup_unavailable');
  if (!parsed.data.items.length) return { claimed: 0, deleted: 0, rescheduled: 0 };

  const ids = parsed.data.items.map((item) => item.id);
  const paths = parsed.data.items.map((item) => item.storage_path);
  let removalFailed = false;
  try {
    const removal = await service.storage.from('ticket-attachments').remove(paths);
    removalFailed = Boolean(removal.error);
  } catch {
    removalFailed = true;
  }
  const { data: finished, error: finishError } = await service.rpc('finish_support_attachment_cleanup', {
    p_token: parsed.data.token,
    p_deleted_ids: removalFailed ? [] : ids,
    p_failed_ids: removalFailed ? ids : [],
  });
  const result = cleanupResultSchema.safeParse(finished);
  if (finishError || !result.success) throw new Error('support_attachment_cleanup_unconfirmed');

  return { claimed: parsed.data.items.length, ...result.data };
}
