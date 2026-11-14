// P4 — GET /api/admin/reconciliation?period=YYYY-MM (super-admin).
// Per-order gross / platform fee / affiliate + recommendation payout / vendor
// net / platform net for the month, with the negative-platform-net flag.

import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';
import { apiFail, apiOk } from '@/lib/validation/schemas';
import { eventOperationsQuerySchema } from '@/lib/admin/event-operations-filters';
import { getOrderMoneyReconciliation, getEventReservationOperations } from '@/lib/admin/reconciliation';
import { malaysiaCalendarDateToIso } from '@/lib/datetime/malaysia';

const financialQuerySchema = z.object({
  search: z.string().max(100).default(''),
  status: z.string().max(64).default('all'),
  net: z.enum(['all', 'positive', 'zero', 'negative']).default('all'),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().refine((size) => [15, 25, 50].includes(size)).default(15),
}).strict();

function monthRange(period: string | null): { fromISO: string; toISO: string } | null {
  let year: number;
  let month: number; // 1-12
  if (period && /^\d{4}-(0[1-9]|1[0-2])$/.test(period)) {
    [year, month] = period.split('-').map(Number);
  } else if (period) {
    return null;
  } else {
    const now = new Date();
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Kuala_Lumpur', year: 'numeric', month: '2-digit',
    }).formatToParts(now);
    year = Number(parts.find((part) => part.type === 'year')?.value);
    month = Number(parts.find((part) => part.type === 'month')?.value);
  }
  const fromDate = `${year}-${String(month).padStart(2, '0')}-01`;
  const nextMonth = new Date(Date.UTC(year, month, 1));
  const toDate = `${nextMonth.getUTCFullYear()}-${String(nextMonth.getUTCMonth() + 1).padStart(2, '0')}-01`;
  return {
    fromISO: malaysiaCalendarDateToIso(fromDate, 'start'),
    toISO: malaysiaCalendarDateToIso(toDate, 'start'),
  };
}

export async function GET(request: Request) {
  const db = await createClient();
  const { data: { user } } = await db.auth.getUser();
  if (!user) return apiFail('UNAUTHORIZED', 'Sign in required', 401);
  const { data: isSuperAdmin, error: roleError } = await db.rpc('is_super_admin', { uid: user.id });
  if (roleError || !isSuperAdmin) return apiFail('FORBIDDEN', 'Super Admin access required', 403);

  const searchParams = new URL(request.url).searchParams;
  const range = monthRange(searchParams.get('period'));
  if (!range) return apiFail('VALIDATION_FAILED', 'period must use YYYY-MM format', 422);

  const financial = financialQuerySchema.safeParse({
    search: searchParams.get('search') ?? '',
    status: searchParams.get('status') ?? 'all',
    net: searchParams.get('net') ?? 'all',
    page: searchParams.get('page') ?? '1',
    pageSize: searchParams.get('pageSize') ?? '15',
  });
  if (!financial.success) return apiFail('VALIDATION_FAILED', 'Invalid financial report filters.', 422);
  const financialKeys = new Set(['period', 'search', 'status', 'net', 'page', 'pageSize']);
  const operationalParams = Object.fromEntries([...searchParams].filter(([key]) => !financialKeys.has(key)));
  const query = eventOperationsQuerySchema.safeParse(operationalParams);
  if (!query.success) return apiFail('VALIDATION_FAILED', 'Invalid exception filters.', 422);
  const service = createServiceClient();
  try {
    const [report, eventOperations] = await Promise.all([
      getOrderMoneyReconciliation(service, range, {
        filters: { search: financial.data.search, status: financial.data.status, net: financial.data.net },
        page: financial.data.page,
        pageSize: financial.data.pageSize,
      }),
      getEventReservationOperations(service, { actorId: user.id, filters: query.data }),
    ]);
    return apiOk({ ...report, eventOperations });
  } catch (error) {
    // The cause was being discarded, which left a 500 with nothing to diagnose.
    console.error('[admin-reconciliation-report]', error instanceof Error ? error.message : error);
    return apiFail('DB_ERROR', 'Unable to load reconciliation report', 500);
  }
}

/** Explicit discovery action; report GET remains read-only. */
export async function POST(request: Request) {
  const db = await createClient();
  const { data: { user } } = await db.auth.getUser();
  if (!user) return apiFail('UNAUTHORIZED', 'Sign in required', 401);
  const { data: allowed, error: roleError } = await db.rpc('is_super_admin', { uid: user.id });
  if (roleError || !allowed) return apiFail('FORBIDDEN', 'Super Admin access required', 403);
  const parsed = z.object({ action: z.literal('refresh_overdue') }).strict().safeParse(await request.json().catch(() => null));
  if (!parsed.success) return apiFail('VALIDATION_FAILED', 'Invalid discovery action', 422);
  const { data, error } = await createServiceClient().rpc('refresh_overdue_event_pickups');
  if (error) return apiFail('DB_ERROR', 'Unable to refresh pickup obligations', 503);
  return apiOk(data);
}
