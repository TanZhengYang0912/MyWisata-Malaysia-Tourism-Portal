// P4 — Member 4: fraud analytics for the admin dashboard.
// CLAUDE-P4-EXTRAS.md Extra 2 — turns "the guards work" (lib/affiliate/fraud.ts's
// existing flag list + getFraudCounters()) into "here's what they caught":
// trends over time, a type/severity breakdown, and top-flagged affiliates.
//
// Read-only. No new fraud DETECTION logic lives here — this only aggregates
// what logFraudFlag()/runFraudSweep() already wrote to affiliate_fraud_flags,
// same as the extras doc's own guardrail.

import type { SupabaseClient } from '@supabase/supabase-js';
import type { FraudFlagType, FraudSeverity } from './fraud';

export type FraudAnalyticsRange = '7d' | '30d' | 'all';

// Fixed, ordered lists (not "whatever showed up in the data") so the type
// and severity breakdowns always render the same categories — a type with
// zero flags in range still shows as a zero bar, which is itself useful
// signal ("the click-velocity guard hasn't fired this week").
const FLAG_TYPES: FraudFlagType[] = [
  'self_referral',
  'duplicate_attribution',
  'expired_attribution',
  'click_velocity',
  'visitor_clustering',
  'zero_conversion',
  'click_cap_reached',
];
const SEVERITIES: FraudSeverity[] = ['low', 'medium', 'high'];

// Safety cap on the 'all' range's day-bucketed series — this is a
// demo-scale project (flag history realistically spans days-to-weeks, not
// years), but nothing stops it from growing; capping keeps the query and
// the chart bounded regardless.
const ALL_RANGE_MAX_DAYS = 90;

export interface FraudFlagsByDay {
  date: string; // YYYY-MM-DD
  count: number;
}

export interface FraudTypeCount {
  flagType: FraudFlagType;
  count: number;
}

export interface FraudSeverityCount {
  severity: FraudSeverity;
  count: number;
}

export interface FraudAnalyticsHeadline {
  totalFlags: number;
  selfReferralsBlocked: number;
  duplicatePayoutsPrevented: number;
  openFlags: number;
  reviewedFlags: number;
  dismissedFlags: number;
  /** From audit_logs (action='affiliate.link.disabled', actor_id IS NULL) —
   *  the automatic-disable signal specifically, not admin-confirmed disables
   *  (autoDisableLink() vs the "Confirm & disable" action both write that
   *  same action, distinguished only by actor_id — see lib/affiliate/fraud.ts). */
  linksAutoDisabled: number;
}

export interface TopFlaggedAffiliate {
  userId: string;
  userName: string;
  affiliateCode: string | null;
  flagCount: number;
}

export interface FraudAnalytics {
  range: FraudAnalyticsRange;
  overTime: FraudFlagsByDay[];
  byType: FraudTypeCount[];
  bySeverity: FraudSeverityCount[];
  headline: FraudAnalyticsHeadline;
  topFlaggedAffiliates: TopFlaggedAffiliate[];
}

function rangeCutoffIso(range: FraudAnalyticsRange, earliestFlagIso: string | null): string | null {
  if (range === '7d') return new Date(Date.now() - 7 * 86_400_000).toISOString();
  if (range === '30d') return new Date(Date.now() - 30 * 86_400_000).toISOString();
  // 'all' — still bounded, per ALL_RANGE_MAX_DAYS above.
  const cap = new Date(Date.now() - ALL_RANGE_MAX_DAYS * 86_400_000).toISOString();
  if (!earliestFlagIso) return cap;
  return earliestFlagIso > cap ? earliestFlagIso : cap;
}

function dayBucketsBetween(startIso: string, endIso: string): string[] {
  const start = new Date(startIso.slice(0, 10) + 'T00:00:00Z');
  const end = new Date(endIso.slice(0, 10) + 'T00:00:00Z');
  const days: string[] = [];
  for (let d = new Date(start); d <= end; d.setUTCDate(d.getUTCDate() + 1)) {
    days.push(d.toISOString().slice(0, 10));
  }
  return days;
}

function userDisplayName(row: { full_name: string | null; email: string } | undefined): string {
  return row?.full_name ?? row?.email ?? 'Unknown user';
}

/**
 * Aggregates affiliate_fraud_flags (+ audit_logs for the auto-disable
 * count) into everything the admin fraud-analytics panel renders. All
 * aggregate, no PII beyond the affiliate identity an admin already sees
 * elsewhere on this page (name/affiliate code).
 */
export async function getFraudAnalytics(service: SupabaseClient, range: FraudAnalyticsRange): Promise<FraudAnalytics> {
  // Earliest flag's date is needed up front to bound 'all' range's day
  // series (see rangeCutoffIso) — cheap, single-row lookup.
  let earliestFlagIso: string | null = null;
  if (range === 'all') {
    const { data } = await service
      .from('affiliate_fraud_flags')
      .select('created_at')
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle();
    earliestFlagIso = data?.created_at ?? null;
  }
  const cutoffIso = rangeCutoffIso(range, earliestFlagIso);

  let flagsQuery = service
    .from('affiliate_fraud_flags')
    .select('id, user_id, link_id, flag_type, severity, status, created_at')
    .order('created_at', { ascending: true });
  if (cutoffIso) flagsQuery = flagsQuery.gte('created_at', cutoffIso);
  const { data: flagsData } = await flagsQuery;
  const flags = flagsData ?? [];

  // ── over time ────────────────────────────────────────────────
  const nowIso = new Date().toISOString();
  const seriesStart = cutoffIso ?? (flags[0]?.created_at ?? nowIso);
  const buckets = dayBucketsBetween(seriesStart, nowIso);
  const countsByDay = new Map<string, number>(buckets.map((d) => [d, 0]));
  for (const f of flags) {
    const day = f.created_at.slice(0, 10);
    if (countsByDay.has(day)) countsByDay.set(day, (countsByDay.get(day) ?? 0) + 1);
  }
  const overTime: FraudFlagsByDay[] = buckets.map((date) => ({ date, count: countsByDay.get(date) ?? 0 }));

  // ── by type / by severity ───────────────────────────────────
  const byType: FraudTypeCount[] = FLAG_TYPES.map((flagType) => ({
    flagType,
    count: flags.filter((f) => f.flag_type === flagType).length,
  }));
  const bySeverity: FraudSeverityCount[] = SEVERITIES.map((severity) => ({
    severity,
    count: flags.filter((f) => f.severity === severity).length,
  }));

  // ── headline ─────────────────────────────────────────────────
  let autoDisableQuery = service
    .from('audit_logs')
    .select('id', { count: 'exact', head: true })
    .eq('action', 'affiliate.link.disabled')
    .eq('entity_type', 'affiliate_links')
    .is('actor_id', null);
  if (cutoffIso) autoDisableQuery = autoDisableQuery.gte('created_at', cutoffIso);
  const { count: linksAutoDisabled } = await autoDisableQuery;

  const headline: FraudAnalyticsHeadline = {
    totalFlags: flags.length,
    selfReferralsBlocked: flags.filter((f) => f.flag_type === 'self_referral').length,
    duplicatePayoutsPrevented: flags.filter((f) => f.flag_type === 'duplicate_attribution').length,
    openFlags: flags.filter((f) => f.status === 'open').length,
    reviewedFlags: flags.filter((f) => f.status === 'reviewed').length,
    dismissedFlags: flags.filter((f) => f.status === 'dismissed').length,
    linksAutoDisabled: linksAutoDisabled ?? 0,
  };

  // ── top flagged affiliates ──────────────────────────────────
  const countByUser = new Map<string, number>();
  for (const f of flags) {
    if (!f.user_id) continue;
    countByUser.set(f.user_id, (countByUser.get(f.user_id) ?? 0) + 1);
  }
  const topUserIds = [...countByUser.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([id]) => id);

  const [{ data: usersData }, { data: linksData }] = await Promise.all([
    topUserIds.length
      ? service.from('users').select('id, full_name, email').in('id', topUserIds)
      : Promise.resolve({ data: [] as { id: string; full_name: string | null; email: string }[] }),
    topUserIds.length
      ? service.from('affiliate_links').select('user_id, affiliate_code').in('user_id', topUserIds)
      : Promise.resolve({ data: [] as { user_id: string; affiliate_code: string }[] }),
  ]);
  const usersById = new Map((usersData ?? []).map((u) => [u.id, u]));
  const codeByUser = new Map((linksData ?? []).map((l) => [l.user_id, l.affiliate_code]));

  const topFlaggedAffiliates: TopFlaggedAffiliate[] = topUserIds.map((userId) => ({
    userId,
    userName: userDisplayName(usersById.get(userId)),
    affiliateCode: codeByUser.get(userId) ?? null,
    flagCount: countByUser.get(userId) ?? 0,
  }));

  return { range, overTime, byType, bySeverity, headline, topFlaggedAffiliates };
}
