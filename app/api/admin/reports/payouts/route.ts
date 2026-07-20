import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';
import { apiFail, apiOk } from '@/lib/validation/schemas';

function malaysiaMonthStart(value: string | null) {
  if (value && /^\d{4}-(0[1-9]|1[0-2])$/.test(value)) return `${value}-01`;
  if (value) return null;
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kuala_Lumpur', year: 'numeric', month: '2-digit' }).formatToParts(new Date());
  const year = parts.find((part) => part.type === 'year')?.value;
  const month = parts.find((part) => part.type === 'month')?.value;
  return year && month ? `${year}-${month}-01` : null;
}

export async function GET(request: Request) {
  const db = await createClient();
  const { data: { user } } = await db.auth.getUser();
  if (!user) return apiFail('UNAUTHORIZED', 'Sign in required', 401);
  const { data: isSuperAdmin, error: roleError } = await db.rpc('is_super_admin', { uid: user.id });
  if (roleError || !isSuperAdmin) return apiFail('FORBIDDEN', 'Super Admin access required', 403);
  const periodStart = malaysiaMonthStart(new URL(request.url).searchParams.get('period'));
  if (!periodStart) return apiFail('VALIDATION_FAILED', 'period must use YYYY-MM format', 422);
  const service = createServiceClient();
  const { data, error } = await service.rpc('generate_monthly_payout_report', { p_period_start: periodStart, p_generated_by: 'super_admin' });
  if (error) return apiFail('REPORT_LOAD_FAILED', 'Unable to load payout report', 500);
  return apiOk(data);
}
