// P4 — GET /api/admin/reconciliation?period=YYYY-MM (super-admin).
// Per-order gross / platform fee / affiliate + recommendation payout / vendor
// net / platform net for the month, with the negative-platform-net flag.

import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';
import { apiFail, apiOk } from '@/lib/validation/schemas';
import { getOrderMoneyReconciliation } from '@/lib/admin/reconciliation';

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

  const range = monthRange(new URL(request.url).searchParams.get('period'));
  if (!range) return apiFail('VALIDATION_FAILED', 'period must use YYYY-MM format', 422);

  return apiOk(await getOrderMoneyReconciliation(createServiceClient(), range));
}
