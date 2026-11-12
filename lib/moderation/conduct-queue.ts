import { z } from 'zod';
import type { SupabaseClient } from '@supabase/supabase-js';

export const CONDUCT_QUEUE_PAGE_SIZES = [15, 25, 50] as const;

export const conductQueueQuerySchema = z.object({
  page: z.coerce.number().int().min(1).max(1_000_000).default(1),
  pageSize: z.coerce.number().int().refine(
    (value) => (CONDUCT_QUEUE_PAGE_SIZES as readonly number[]).includes(value),
    'pageSize must be 15, 25 or 50',
  ).default(15),
  query: z.string().trim().max(200).default(''),
  reviewState: z.enum(['open', 'reviewed', 'all']).default('open'),
  recordType: z.enum(['all', 'flagged_conduct', 'reported_chat']).default('all'),
});

export type ConductQueueQuery = z.infer<typeof conductQueueQuerySchema>;

const conductFlagSchema = z.object({
  id: z.string().uuid(),
  flaggedAdminName: z.string(),
  targetUserId: z.string().uuid().nullable(),
  targetUserName: z.string().nullable(),
  source: z.enum(['ticket_reply', 'admin_ai']),
  sourceRefId: z.string(),
  originalText: z.string(),
  severity: z.enum(['medium', 'high']),
  status: z.enum(['open', 'reviewed']),
  createdAt: z.string(),
});

const chatReportSchema = z.object({
  id: z.string().uuid(),
  reporterName: z.string(),
  partyAName: z.string(),
  partyBName: z.string().nullable(),
  chatType: z.enum(['user_vendor', 'user_admin', 'vendor_admin']),
  threadRef: z.string(),
  reason: z.string().nullable(),
  status: z.enum(['open', 'reviewed']),
  createdAt: z.string(),
});

const conductQueueItemSchema = z.discriminatedUnion('kind', [
  z.object({
    id: z.string().uuid(),
    kind: z.literal('flagged_conduct'),
    status: z.enum(['open', 'reviewed']),
    createdAt: z.string(),
    data: conductFlagSchema,
  }),
  z.object({
    id: z.string().uuid(),
    kind: z.literal('reported_chat'),
    status: z.enum(['open', 'reviewed']),
    createdAt: z.string(),
    data: chatReportSchema,
  }),
]);

export const conductQueueResponseSchema = z.object({
  items: z.array(conductQueueItemSchema),
  total: z.number().int().nonnegative(),
  page: z.number().int().min(1),
  pageSize: z.union([z.literal(15), z.literal(25), z.literal(50)]),
  totalPages: z.number().int().min(1),
  metrics: z.object({
    needsAction: z.number().int().nonnegative(),
    flaggedConduct: z.number().int().nonnegative(),
    reportedChat: z.number().int().nonnegative(),
    highSeverity: z.number().int().nonnegative(),
    reviewed: z.number().int().nonnegative(),
  }),
});

export type ConductQueueItem = z.infer<typeof conductQueueItemSchema>;
export type ConductQueueResponse = z.infer<typeof conductQueueResponseSchema>;

export type ConductQueueResult =
  | { ok: true; data: ConductQueueResponse }
  | { ok: false; errorCode: string };

function errorCode(error: unknown): string {
  if (!error || typeof error !== 'object' || !('code' in error)) return 'unknown';
  return typeof error.code === 'string' && /^[A-Z0-9]{5}$/.test(error.code) ? error.code : 'unknown';
}

export async function getConductQueue(
  service: SupabaseClient,
  actorId: string,
  query: ConductQueueQuery,
): Promise<ConductQueueResult> {
  try {
    const { data, error } = await service.rpc('get_admin_conduct_queue', {
      p_actor_id: actorId,
      p_page: query.page,
      p_page_size: query.pageSize,
      p_query: query.query,
      p_review_state: query.reviewState,
      p_record_type: query.recordType,
    });
    if (error) return { ok: false, errorCode: errorCode(error) };
    const parsed = conductQueueResponseSchema.safeParse(data);
    if (!parsed.success) return { ok: false, errorCode: 'invalid_response' };
    return { ok: true, data: parsed.data };
  } catch (error) {
    return { ok: false, errorCode: errorCode(error) };
  }
}
