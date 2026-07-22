import { createServiceClient } from '@/lib/supabase/service';
import { clearMaturedRecommendationRewards } from '@/lib/recommendations/reward-clearing';
import { apiFail, apiOk } from '@/lib/validation/schemas';

function currentMalaysiaMonthStart(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kuala_Lumpur', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(now);
  const year = parts.find((part) => part.type === 'year')?.value;
  const month = parts.find((part) => part.type === 'month')?.value;
  if (!year || !month) throw new Error('Unable to calculate Malaysia month');
  return `${year}-${month}-01`;
}

export async function POST(request: Request) {
  const expected = process.env.CRON_SECRET;
  if (!expected) return apiFail('MAINTENANCE_NOT_CONFIGURED', 'Maintenance secret is not configured', 503);
  const supplied = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ?? request.headers.get('x-cron-secret');
  if (!supplied || supplied !== expected) return apiFail('UNAUTHORIZED', 'Invalid maintenance secret', 401);

  const service = createServiceClient();
  const now = new Date();
  const { data: escalated, error: escalationError } = await service.rpc('escalate_withdrawals', { p_now: now.toISOString() });
  if (escalationError) return apiFail('ESCALATION_FAILED', 'Unable to escalate overdue withdrawals', 500);

  let rewardsCleared: unknown;
  try {
    rewardsCleared = await clearMaturedRecommendationRewards(service);
  } catch (error) {
    console.error('[wallet-maintenance] reward clearance failed', error);
    return apiFail('REWARD_CLEARANCE_FAILED', 'Unable to clear matured rewards', 500);
  }

  const periodStart = currentMalaysiaMonthStart(now);
  const { data: report, error: reportError } = await service.rpc('generate_monthly_payout_report', {
    p_period_start: periodStart, p_generated_by: 'scheduler',
  });
  if (reportError) return apiFail('REPORT_GENERATION_FAILED', 'Unable to generate the monthly payout report', 500);
  return apiOk({ periodStart, escalated: Number(escalated ?? 0), rewardsCleared, report });
}

export { currentMalaysiaMonthStart };
