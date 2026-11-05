import { z } from 'zod';

export const SUPPORT_TICKET_PAGE_SIZE = 10;

const categories = ['all', 'booking', 'payment', 'vendor', 'withdrawal', 'affiliate', 'general', 'kyc', 'technical'] as const;
const statuses = ['all', 'open', 'in_progress', 'resolved', 'closed'] as const;
const sortKeys = ['default', 'created', 'lastActivity', 'status', 'category', 'unread'] as const;

export const supportQueueQuerySchema = z.object({
  page: z.coerce.number().int().min(1).max(1_000_000).default(1),
  category: z.enum(categories).default('all'),
  status: z.enum(statuses).default('all'),
  assignedToMe: z.enum(['true', 'false']).default('false').transform((value) => value === 'true'),
  unreadOnly: z.enum(['true', 'false']).default('false').transform((value) => value === 'true'),
  search: z.string().trim().max(200).default(''),
  sort: z.enum(sortKeys).default('default'),
});

export function supportQueueQuery(request: Request) {
  return supportQueueQuerySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams));
}

const supportQueueTicketSchema = z.object({
  id: z.string(),
  userName: z.string().nullable(),
  subject: z.string(),
  category: z.string(),
  classificationMethod: z.string().nullable(),
  status: z.string(),
  createdAt: z.string(),
  lastActivityAt: z.string(),
  unread: z.boolean(),
  unanswered: z.boolean(),
});

export const supportQueueResponseSchema = z.object({
  tickets: z.array(supportQueueTicketSchema),
  stats: z.object({
    open: z.number().int().nonnegative(),
    inProgress: z.number().int().nonnegative(),
    resolved: z.number().int().nonnegative(),
    unanswered: z.number().int().nonnegative(),
    avgFirstResponseHours: z.number().nullable(),
  }),
  page: z.number().int().positive(),
  pageSize: z.literal(SUPPORT_TICKET_PAGE_SIZE),
  total: z.number().int().nonnegative(),
  totalPages: z.number().int().positive(),
});

export type SupportQueueTicket = z.infer<typeof supportQueueTicketSchema>;
export type SupportQueueResult = z.infer<typeof supportQueueResponseSchema>;
