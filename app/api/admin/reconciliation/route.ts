// P4 — GET /api/admin/reconciliation?period=YYYY-MM (super-admin).
// Per-order gross / platform fee / affiliate + recommendation payout / vendor
// net / platform net for the month, with the negative-platform-net flag.

import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';
import { apiFail, apiOk } from '@/lib/validation/schemas';
import { eventOperationsQuerySchema } from '@/lib/admin/event-operations-filters';
import { getOrderMoneyReconciliation, getEventReservationOperations } from '@/lib/admin/reconciliation';

function monthRange(period: string | null): { fromISO: string; toISO: string } | null {
  let year: number;
  let month: number; // 1-12
  if (period && /^\d{4}-(0[1-9]|1[0-2])$/.test(period)) {
    [year, month] = period.split('-').map(Number);
  } else if (period) {
    return null;
  } else {
    const now = new Date();
    year = now.getUTCFullYear();
    month = now.getUTCMonth() + 1;
  }
  const from = new Date(Date.UTC(year, month - 1, 1));
  const to = new Date(Date.UTC(year, month, 1));
  return { fromISO: from.toISOString(), toISO: to.toISOString() };
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

  const operationalParams = Object.fromEntries([...searchParams].filter(([key]) => key !== 'period'));
  const query = eventOperationsQuerySchema.safeParse(operationalParams);
  if (!query.success) return apiFail('VALIDATION_FAILED', 'Invalid exception filters.', 422);
  const service = createServiceClient();
  try {
    const [report, eventOperations] = await Promise.all([getOrderMoneyReconciliation(service, range), getEventReservationOperations(service, { actorId: user.id, filters: query.data })]);
    return apiOk({ ...report, eventOperations });
  } catch (error) {
    // The cause was being discarded, which left a 500 with nothing to diagnose.
    console.error('[reconciliation] report failed', error instanceof Error ? error.message : error);
    return apiFail('DB_ERROR', 'Unable to load event obligations', 500);
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
