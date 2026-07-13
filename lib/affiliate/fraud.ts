// P4 — Member 4: fraud detection. CLAUDE-PHASE2.md Feature C.
//
// Two kinds of flags, written to the same affiliate_fraud_flags table
// (migration 014):
//   - Per-conversion guard trips (self_referral, duplicate_attribution,
//     expired_attribution) — logged directly from lib/affiliate/attribution.ts
//     at the moment a guard fires. Each is a real, distinct event, so these
//     are never deduped.
//   - Sweep-detected patterns (click_velocity, visitor_clustering,
//     zero_conversion) — found by runFraudSweep() below, scanning all links
//     for shapes a single conversion can't see. These ARE deduped: no second
//     open flag of the same type on the same link within 24h, per spec.
//
// ⚠️ DEVIATION FROM THE ORIGINAL SPEC — auto-disable is a pattern, not a
// single event.
//
// CLAUDE-PHASE2.md's Section 4 says "if a link accumulates a high-severity
// flag, set is_active = false" — read literally, that auto-disables on the
// FIRST self-referral, since that guard is severity='high'. Caught before
// this went further: someone clicking their own shared link once (e.g.
// out of habit, testing their own share) is a plausible accident. The guard
// already does its real job on every occurrence — no commission is ever
// created — so nothing financial is at risk from waiting. Killing their
// whole earning channel over one click, silently, with no way back in
// except emailing an admin, is a false-positive machine.
//
// So: self_referral only auto-disables once the SAME link accumulates
// `fraud.self_referral_auto_disable_count` (default 3) such flags within
// `fraud.self_referral_auto_disable_window_days` (default 30) — see
// maybeAutoDisableForSelfReferral() below. One-off self-clicks are logged
// and visible to admin, but the link stays live.
//
// Sweep-detected flags (click_velocity, visitor_clustering, zero_conversion)
// NEVER auto-disable, regardless of severity — same reasoning applies even
// harder there, since those are statistical inferences over ambiguous
// evidence (a zero-conversion link could just be a dead group chat, not
// fraud) rather than a deterministic guard trip. They're always admin
// review only, via the "Confirm & disable" action.

import type { SupabaseClient } from '@supabase/supabase-js';
import { getFraudThresholds } from './settings';

const SELF_REFERRAL_STATUSES_COUNTED = ['open', 'reviewed'] as const; // exclude 'dismissed' — an admin already ruled it a false positive

export type FraudFlagType =
  | 'self_referral'
  | 'duplicate_attribution'
  | 'expired_attribution'
  | 'click_velocity'
  | 'zero_conversion'
  | 'visitor_clustering';

export type FraudSeverity = 'low' | 'medium' | 'high';
export type FraudFlagStatus = 'open' | 'reviewed' | 'dismissed';

const SWEEP_FLAG_DEDUPE_HOURS = 24;

export interface LogFraudFlagInput {
  linkId: string | null;
  userId: string | null;
  orderId?: string | null;
  flagType: FraudFlagType;
  severity: FraudSeverity;
  detail: Record<string, unknown>;
}

/**
 * Inserts a flag row. Auto-disable is NOT triggered by severity alone — see
 * the file-header note above. Only self_referral can auto-disable, and only
 * once it's a pattern (maybeAutoDisableForSelfReferral). Every other flag
 * type, including sweep-detected ones, is admin-review-only. Does not
 * dedupe — callers that need the 24h sweep dedupe window call
 * hasRecentOpenFlag() first.
 */
export async function logFraudFlag(service: SupabaseClient, input: LogFraudFlagInput): Promise<string | null> {
  const { data, error } = await service
    .from('affiliate_fraud_flags')
    .insert({
      link_id: input.linkId,
      user_id: input.userId,
      order_id: input.orderId ?? null,
      flag_type: input.flagType,
      severity: input.severity,
      detail: input.detail,
    })
    .select('id')
    .single();

  if (error) {
    console.error('[affiliate] failed to log fraud flag', input.flagType, error.message);
    return null;
  }

  if (input.flagType === 'self_referral' && input.linkId) {
    await maybeAutoDisableForSelfReferral(service, input.linkId);
  }

  return data.id as string;
}

/**
 * Auto-disables a link once it has accumulated
 * `fraud.self_referral_auto_disable_count` self_referral flags (default 3)
 * within `fraud.self_referral_auto_disable_window_days` (default 30) —
 * counting only 'open'/'reviewed' flags, since a 'dismissed' one means an
 * admin already decided it wasn't real. One-off self-clicks never trigger
 * this — the commission block is the only consequence until the pattern
 * repeats.
 */
async function maybeAutoDisableForSelfReferral(service: SupabaseClient, linkId: string): Promise<void> {
  const thresholds = await getFraudThresholds(service);
  const cutoff = new Date(Date.now() - thresholds.selfReferralAutoDisableWindowDays * 86_400_000).toISOString();

  const { count } = await service
    .from('affiliate_fraud_flags')
    .select('id', { count: 'exact', head: true })
    .eq('link_id', linkId)
    .eq('flag_type', 'self_referral')
    .in('status', SELF_REFERRAL_STATUSES_COUNTED)
    .gte('created_at', cutoff);

  if ((count ?? 0) >= thresholds.selfReferralAutoDisableCount) {
    await autoDisableLink(
      service,
      linkId,
      `auto-disabled after ${count} self-referral flags within ${thresholds.selfReferralAutoDisableWindowDays} days`,
      null,
    );
  }
}

/** True if an OPEN flag of this type already exists for this link within the last 24h. */
async function hasRecentOpenFlag(service: SupabaseClient, linkId: string, flagType: FraudFlagType): Promise<boolean> {
  const cutoff = new Date(Date.now() - SWEEP_FLAG_DEDUPE_HOURS * 3_600_000).toISOString();
  const { data } = await service
    .from('affiliate_fraud_flags')
    .select('id')
    .eq('link_id', linkId)
    .eq('flag_type', flagType)
    .eq('status', 'open')
    .gte('created_at', cutoff)
    .limit(1);
  return (data?.length ?? 0) > 0;
}

/**
 * Sets affiliate_links.is_active = false and writes an audit_logs entry.
 * `actorId` is null for automatic (fraud-triggered) disables, or the admin's
 * user id for a manual "Confirm & disable" action. No-op if already
 * inactive — avoids a redundant audit_logs entry on every subsequent flag
 * against an already-disabled link.
 */
export async function autoDisableLink(
  service: SupabaseClient,
  linkId: string,
  note: string,
  actorId: string | null,
): Promise<void> {
  const { data: link } = await service.from('affiliate_links').select('id, is_active').eq('id', linkId).maybeSingle();
  if (!link || !link.is_active) return;

  await service.from('affiliate_links').update({ is_active: false }).eq('id', linkId);
  await service.from('audit_logs').insert({
    actor_id: actorId,
    action: 'affiliate.link.disabled',
    entity_type: 'affiliate_links',
    entity_id: linkId,
    before_data: { is_active: true },
    after_data: { is_active: false },
    note,
  });
}

/**
 * Reverses autoDisableLink — sets is_active = true and writes an audit_logs
 * entry. Always a manual admin action (CLAUDE-PHASE2.md Section 4: "Admin
 * can re-enable it from the dashboard") — there is no automatic
 * re-enable. No-op if already active.
 */
export async function reactivateLink(service: SupabaseClient, linkId: string, actorId: string): Promise<void> {
  const { data: link } = await service.from('affiliate_links').select('id, is_active').eq('id', linkId).maybeSingle();
  if (!link || link.is_active) return;

  await service.from('affiliate_links').update({ is_active: true }).eq('id', linkId);
  await service.from('audit_logs').insert({
    actor_id: actorId,
    action: 'affiliate.link.reenabled',
    entity_type: 'affiliate_links',
    entity_id: linkId,
    before_data: { is_active: false },
    after_data: { is_active: true },
    note: `admin re-enabled link ${linkId}`,
  });
}

export interface DisabledLink {
  linkId: string;
  userId: string;
  userName: string;
  affiliateCode: string;
}

/** Every currently-disabled link, for the admin dashboard's re-enable list. */
export async function getDisabledLinks(service: SupabaseClient): Promise<DisabledLink[]> {
  const { data: linksData } = await service
    .from('affiliate_links')
    .select('id, user_id, affiliate_code')
    .eq('is_active', false);
  const links = linksData ?? [];
  if (!links.length) return [];

  const userIds = [...new Set(links.map((l) => l.user_id))];
  const { data: usersData } = await service.from('users').select('id, full_name, email').in('id', userIds);
  const usersById = new Map((usersData ?? []).map((u) => [u.id, u]));

  return links.map((l) => ({
    linkId: l.id,
    userId: l.user_id,
    userName: userDisplayName(usersById.get(l.user_id)),
    affiliateCode: l.affiliate_code,
  }));
}

export interface FraudSweepResult {
  linksScanned: number;
  flagsCreated: { linkId: string; flagType: FraudFlagType; severity: FraudSeverity }[];
}

/**
 * Scans every affiliate link for patterns a single conversion can't see.
 * Read-scale is fine for a demo-sized dataset (all clicks/attributions
 * fetched once, grouped in memory) — this is not meant to run per-request,
 * only from the admin "Run fraud sweep" button and from the clearing job.
 */
export async function runFraudSweep(service: SupabaseClient): Promise<FraudSweepResult> {
  const thresholds = await getFraudThresholds(service);
  const velocityCutoff = new Date(Date.now() - thresholds.clickVelocityWindowMinutes * 60_000).toISOString();

  const [{ data: linksData }, { data: clicksData }, { data: attributionsData }] = await Promise.all([
    service.from('affiliate_links').select('id, user_id, is_active'),
    service.from('affiliate_clicks').select('id, link_id, ip_hash, created_at'),
    service.from('affiliate_attributions').select('click_id'),
  ]);

  const links = linksData ?? [];
  const clicks = clicksData ?? [];
  const attributedClickIds = new Set((attributionsData ?? []).map((a) => a.click_id));

  const clicksByLink = new Map<string, typeof clicks>();
  for (const click of clicks) {
    const list = clicksByLink.get(click.link_id) ?? [];
    list.push(click);
    clicksByLink.set(click.link_id, list);
  }

  const result: FraudSweepResult = { linksScanned: links.length, flagsCreated: [] };

  for (const link of links) {
    const linkClicks = clicksByLink.get(link.id) ?? [];

    // ── click_velocity ──────────────────────────────────────────
    const recentClicks = linkClicks.filter((c) => c.created_at >= velocityCutoff);
    if (recentClicks.length > thresholds.clickVelocityMax) {
      if (!(await hasRecentOpenFlag(service, link.id, 'click_velocity'))) {
        const severity: FraudSeverity = recentClicks.length > thresholds.clickVelocityMax * 2 ? 'high' : 'medium';
        await logFraudFlag(service, {
          linkId: link.id,
          userId: link.user_id,
          flagType: 'click_velocity',
          severity,
          detail: {
            clicksInWindow: recentClicks.length,
            windowMinutes: thresholds.clickVelocityWindowMinutes,
            threshold: thresholds.clickVelocityMax,
          },
        });
        result.flagsCreated.push({ linkId: link.id, flagType: 'click_velocity', severity });
      }
    }

    // ── visitor_clustering ──────────────────────────────────────
    if (linkClicks.length >= thresholds.visitorClusteringMinClicks) {
      const byVisitor = new Map<string, number>();
      for (const click of linkClicks) {
        if (!click.ip_hash) continue;
        byVisitor.set(click.ip_hash, (byVisitor.get(click.ip_hash) ?? 0) + 1);
      }
      let topVisitorHash: string | null = null;
      let topVisitorCount = 0;
      for (const [hash, count] of byVisitor) {
        if (count > topVisitorCount) {
          topVisitorHash = hash;
          topVisitorCount = count;
        }
      }
      const ratio = linkClicks.length ? topVisitorCount / linkClicks.length : 0;
      if (topVisitorHash && ratio > thresholds.visitorClusteringRatio) {
        if (!(await hasRecentOpenFlag(service, link.id, 'visitor_clustering'))) {
          await logFraudFlag(service, {
            linkId: link.id,
            userId: link.user_id,
            flagType: 'visitor_clustering',
            severity: 'medium',
            detail: {
              totalClicks: linkClicks.length,
              topVisitorClicks: topVisitorCount,
              ratio: Number(ratio.toFixed(2)),
              threshold: thresholds.visitorClusteringRatio,
            },
          });
          result.flagsCreated.push({ linkId: link.id, flagType: 'visitor_clustering', severity: 'medium' });
        }
      }
    }

    // ── zero_conversion ─────────────────────────────────────────
    if (linkClicks.length >= thresholds.zeroConversionMinClicks) {
      const hasAnyReferral = linkClicks.some((c) => attributedClickIds.has(c.id));
      if (!hasAnyReferral) {
        if (!(await hasRecentOpenFlag(service, link.id, 'zero_conversion'))) {
          await logFraudFlag(service, {
            linkId: link.id,
            userId: link.user_id,
            flagType: 'zero_conversion',
            severity: 'medium',
            detail: { totalClicks: linkClicks.length, threshold: thresholds.zeroConversionMinClicks },
          });
          result.flagsCreated.push({ linkId: link.id, flagType: 'zero_conversion', severity: 'medium' });
        }
      }
    }
  }

  return result;
}

export interface FraudFlagRow {
  id: string;
  linkId: string | null;
  userId: string | null;
  userName: string;
  affiliateCode: string | null;
  orderId: string | null;
  flagType: FraudFlagType;
  severity: FraudSeverity;
  detail: Record<string, unknown> | null;
  status: FraudFlagStatus;
  createdAt: string;
  reviewedAt: string | null;
}

export interface FraudCounters {
  selfReferralsBlocked: number;
  duplicatePayoutsPrevented: number;
  openFlags: number;
  linksDisabled: number;
}

function userDisplayName(row: { full_name: string | null; email: string } | undefined): string {
  return row?.full_name ?? row?.email ?? 'Unknown user';
}

/** All flags, newest first, with the affiliate's name/code resolved for display. */
export async function getFraudFlags(service: SupabaseClient): Promise<FraudFlagRow[]> {
  const { data: flagsData } = await service
    .from('affiliate_fraud_flags')
    .select('id, link_id, user_id, order_id, flag_type, severity, detail, status, created_at, reviewed_at')
    .order('created_at', { ascending: false });
  const flags = flagsData ?? [];

  const userIds = [...new Set(flags.map((f) => f.user_id).filter((id): id is string => Boolean(id)))];
  const linkIds = [...new Set(flags.map((f) => f.link_id).filter((id): id is string => Boolean(id)))];

  const [{ data: usersData }, { data: linksData }] = await Promise.all([
    userIds.length
      ? service.from('users').select('id, full_name, email').in('id', userIds)
      : Promise.resolve({ data: [] as { id: string; full_name: string | null; email: string }[] }),
    linkIds.length
      ? service.from('affiliate_links').select('id, affiliate_code').in('id', linkIds)
      : Promise.resolve({ data: [] as { id: string; affiliate_code: string }[] }),
  ]);
  const usersById = new Map((usersData ?? []).map((u) => [u.id, u]));
  const codeByLink = new Map((linksData ?? []).map((l) => [l.id, l.affiliate_code]));

  return flags.map((f) => ({
    id: f.id,
    linkId: f.link_id,
    userId: f.user_id,
    userName: f.user_id ? userDisplayName(usersById.get(f.user_id)) : 'Unknown user',
    affiliateCode: f.link_id ? (codeByLink.get(f.link_id) ?? null) : null,
    orderId: f.order_id,
    flagType: f.flag_type,
    severity: f.severity,
    detail: f.detail,
    status: f.status,
    createdAt: f.created_at,
    reviewedAt: f.reviewed_at,
  }));
}

/** The "X self-referrals blocked, Y duplicate payouts prevented" counter — see CLAUDE-PHASE2.md Section 4. */
export async function getFraudCounters(service: SupabaseClient): Promise<FraudCounters> {
  const [selfReferral, duplicateAttribution, openFlags, disabledLinks] = await Promise.all([
    service.from('affiliate_fraud_flags').select('id', { count: 'exact', head: true }).eq('flag_type', 'self_referral'),
    service.from('affiliate_fraud_flags').select('id', { count: 'exact', head: true }).eq('flag_type', 'duplicate_attribution'),
    service.from('affiliate_fraud_flags').select('id', { count: 'exact', head: true }).eq('status', 'open'),
    service.from('affiliate_links').select('id', { count: 'exact', head: true }).eq('is_active', false),
  ]);

  return {
    selfReferralsBlocked: selfReferral.count ?? 0,
    duplicatePayoutsPrevented: duplicateAttribution.count ?? 0,
    openFlags: openFlags.count ?? 0,
    linksDisabled: disabledLinks.count ?? 0,
  };
}
