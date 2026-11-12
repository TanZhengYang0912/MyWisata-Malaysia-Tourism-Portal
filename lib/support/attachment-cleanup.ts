import 'server-only';
import { createHash } from 'node:crypto';
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

const reconciliationBatchSchema = z.object({
  token: z.string().uuid(),
  items: z.array(z.object({
    id: z.string().uuid(),
    operation_id: z.string().uuid(),
    storage_path: z.string().regex(/^[0-9a-f-]{36}\/([0-9a-f-]{36})\.(jpg|png|webp|pdf)$/i),
    server_sha256: z.string().regex(/^[0-9a-f]{64}$/),
    size_bytes: z.number().int().min(1).max(10 * 1024 * 1024),
  }).strict()).max(50),
}).strict();

const reconciliationResultSchema = z.object({ state: z.enum(['uploaded', 'bound', 'unknown']) }).strict();

export async function reconcileSupportAttachments() {
  const service = createServiceClient();
  const { data, error } = await service.rpc('claim_support_attachment_reconciliation');
  const parsed = reconciliationBatchSchema.safeParse(data);
  if (error || !parsed.success) throw new Error('support_attachment_reconciliation_unavailable');
  if (!parsed.data.items.length) return { claimed: 0, recovered: 0, unknown: 0 };

  let recovered = 0;
  let unknown = 0;
  const storage = service.storage.from('ticket-attachments');
  for (const item of parsed.data.items) {
    let objectVerified = false;
    try {
      const result = await storage.download(item.storage_path);
      if (result.data && !result.error) {
        const bytes = Buffer.from(await result.data.arrayBuffer());
        objectVerified = bytes.length === item.size_bytes
          && createHash('sha256').update(bytes).digest('hex') === item.server_sha256;
      }
    } catch {
      objectVerified = false;
    }

    const { data: finished, error: finishError } = await service.rpc('finish_support_attachment_reconciliation', {
      p_operation_id: item.operation_id,
      p_token: parsed.data.token,
      p_object_verified: objectVerified,
    });
    const finishResult = reconciliationResultSchema.safeParse(finished);
    if (finishError || !finishResult.success) throw new Error('support_attachment_reconciliation_unconfirmed');
    if (finishResult.data.state === 'uploaded' || finishResult.data.state === 'bound') recovered += 1;
    else unknown += 1;
  }

  return { claimed: parsed.data.items.length, recovered, unknown };
}

export async function cleanupSupportAttachments() {
  const service = createServiceClient();
  const { data, error } = await service.rpc('claim_support_attachment_cleanup');
  const parsed = cleanupBatchSchema.safeParse(data);
  if (error || !parsed.success) throw new Error('support_attachment_cleanup_unavailable');
  if (!parsed.data.items.length) {
    return { claimed: 0, deleted: 0, failed: 0, skipped: 0, rescheduled: 0 };
  }

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
  const claimed = parsed.data.items.length;
  const accounted = result.data.deleted + result.data.rescheduled;
  if (accounted > claimed) throw new Error('support_attachment_cleanup_accounting_invalid');

  return {
    claimed,
    ...result.data,
    failed: result.data.rescheduled,
    skipped: claimed - accounted,
  };
}
