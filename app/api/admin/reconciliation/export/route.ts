import { z } from 'zod';
import { csvRow } from '@/lib/admin/csv';
import { getOrderMoneyReconciliation } from '@/lib/admin/reconciliation';
import { malaysiaCalendarDateToIso } from '@/lib/datetime/malaysia';
import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';
import { apiFail } from '@/lib/validation/schemas';

const exportQuerySchema = z.object({
  period: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/),
  search: z.string().max(100).default(''),
  status: z.string().max(64).default('all'),
  net: z.enum(['all', 'positive', 'zero', 'negative']).default('all'),
}).strict();

const EXPORT_LIMIT = 10_000;

function monthRange(period: string) {
  const [year, month] = period.split('-').map(Number);
  const fromDate = `${year}-${String(month).padStart(2, '0')}-01`;
  const nextMonth = new Date(Date.UTC(year, month, 1));
  const toDate = `${nextMonth.getUTCFullYear()}-${String(nextMonth.getUTCMonth() + 1).padStart(2, '0')}-01`;
  return {
    fromISO: malaysiaCalendarDateToIso(fromDate, 'start'),
    toISO: malaysiaCalendarDateToIso(toDate, 'start'),
  };
}

function safeCsvValue(value: unknown) {
  const text = String(value ?? '');
  return /^[\s\u0000-\u001f]*[=+@-]/.test(text) ? `'${text}` : text;
}

export async function GET(request: Request) {
  const db = await createClient();
  const { data: { user }, error: authError } = await db.auth.getUser();
  if (authError || !user) return apiFail('UNAUTHORIZED', 'Sign in required', 401);
  const { data: isSuperAdmin, error: roleError } = await db.rpc('is_super_admin', { uid: user.id });
  if (roleError || isSuperAdmin !== true) return apiFail('FORBIDDEN', 'Super Admin access required', 403);

  const params = new URL(request.url).searchParams;
  const parsed = exportQuerySchema.safeParse({
    period: params.get('period'),
    search: params.get('search') ?? '',
    status: params.get('status') ?? 'all',
    net: params.get('net') ?? 'all',
  });
  if (!parsed.success) return apiFail('VALIDATION_FAILED', 'Invalid export filters.', 422);

  try {
    const report = await getOrderMoneyReconciliation(createServiceClient(), monthRange(parsed.data.period), {
      filters: { search: parsed.data.search, status: parsed.data.status, net: parsed.data.net },
      page: 1,
      pageSize: EXPORT_LIMIT + 1,
    });
    if (report.total > EXPORT_LIMIT) {
      return apiFail('VALIDATION_FAILED', 'Narrow filters to export 10,000 orders or fewer.', 422);
    }

    const header = ['order', 'status', 'paid_at', 'gross_rm', 'platform_fee_rm', 'vendor_net_rm', 'affiliate_rm', 'recommendation_rm', 'platform_net_rm'];
    const lines = report.rows.map((row) => {
      const values = [
        row.orderDisplayId ?? '', row.status, row.paidAt ?? '',
        (row.grossSen / 100).toFixed(2), (row.platformFeeSen / 100).toFixed(2),
        (row.vendorNetSen / 100).toFixed(2), (row.affiliatePayoutSen / 100).toFixed(2),
        (row.recommendationPayoutSen / 100).toFixed(2), (row.platformNetSen / 100).toFixed(2),
      ];
      values[0] = safeCsvValue(values[0]);
      values[1] = safeCsvValue(values[1]);
      values[2] = safeCsvValue(values[2]);
      return csvRow(values);
    });
    const csv = [csvRow(header), ...lines].join('\r\n');
    return new Response(`\uFEFF${csv}`, {
      headers: {
        'content-type': 'text/csv; charset=utf-8',
        'content-disposition': `attachment; filename="reconciliation-${parsed.data.period}.csv"`,
        'cache-control': 'no-store',
      },
    });
  } catch (error) {
    console.error('[admin-reconciliation-export]', error);
    return apiFail('DB_ERROR', 'Unable to export reconciliation report', 500);
  }
}
