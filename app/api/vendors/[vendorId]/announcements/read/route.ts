import { z } from 'zod';
import { apiFail, apiOk, databaseUuidSchema, parseBody } from '@/lib/validation/schemas';
import { authorizeVendor } from '@/lib/vendor-authorization';
import { markAnnouncementsRead, markAnnouncementsUnread } from '@/lib/vendor/announcements';

interface Props { params: Promise<{ vendorId: string }> }

const announcementBatchSchema = z.object({
  ids: z.array(databaseUuidSchema).min(1).max(10_000)
    .refine((ids) => new Set(ids).size === ids.length, 'Duplicate announcement IDs are not allowed'),
  action: z.enum(['mark_read', 'mark_unread']).default('mark_read'),
}).strict();

export async function POST(request: Request, { params }: Props) {
  const { vendorId } = await params;
  const access = await authorizeVendor(vendorId, undefined, { allowEventVendor: true });
  if (!access.ok) return access.response;

  const parsed = await parseBody(request, announcementBatchSchema);
  if (!parsed.ok) return parsed.response;

  const result = parsed.data.action === 'mark_read'
    ? await markAnnouncementsRead(access.access.authDb, parsed.data.ids)
    : await markAnnouncementsUnread(access.access.authDb, parsed.data.ids);
  if (!result.ok) {
    if (result.code === 'not_found') return apiFail('NOT_FOUND', 'Announcement not found', 404);
    if (result.code === 'invalid_batch') return apiFail('INVALID_BATCH', 'The announcement selection is invalid', 400);
    const actionLabel = parsed.data.action === 'mark_read' ? 'read' : 'unread';
    return apiFail('DB_ERROR', `Failed to mark announcements as ${actionLabel}`, 500);
  }

  return apiOk({ ok: true });
}
