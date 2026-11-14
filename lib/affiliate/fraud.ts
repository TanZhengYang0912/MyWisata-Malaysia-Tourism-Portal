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
// ⚠️ DEVIATION FROM THE ORIGINAL SPEC — no flag auto-disables a link.
//
// CLAUDE-PHASE2.md's Section 4 says "if a link accumulates a high-severity
// flag, set is_active = false". self_referral (an affiliate buying through
// their own link) used to be high severity and auto-disabled after 3 in 30
// days. Product decision 2026-10-08: buying something you shared yourself
// is ordinary behaviour, and the guard already does the real job — no
// commission is ever created — so nothing financial is at risk. It is now a
// low-severity record for admin visibility only: it never disables the link
// and is excluded from the tier fraud rate (FRAUD_RATE_EXCLUDED_FLAG_TYPES).
//
// Sweep-detected flags (click_velocity, visitor_clustering, zero_conversion)
// NEVER auto-disable, regardless of severity — same reasoning applies even
// harder there, since those are statistical inferences over ambiguous
// evidence (a zero-conversion link could just be a dead group chat, not
// fraud) rather than a deterministic guard trip. They're always admin
// review only, via the "Confirm & disable" action.

import type { SupabaseClient } from '@supabase/supabase-js';
import { getFraudThresholds } from './settings';

/** Informational flags that are not evidence of abuse, so they never count toward a link's tier fraud rate. */
export const FRAUD_RATE_EXCLUDED_FLAG_TYPES: readonly FraudFlagType[] = [
  'self_referral',
  // A buyer coming back after the 7-day window is ordinary, not abuse.
  'expired_attribution',
];

export type FraudFlagType =
  | 'self_referral'
  | 'duplicate_attribution'
  | 'expired_attribution'
  | 'click_velocity'
  | 'zero_conversion'
  | 'visitor_clustering'
  // Limited-tier affiliate hit their §8.3 monthly click cap — not itself
  // evidence of abuse (a legitimate limited affiliate is expected to reach
  // it eventually), just observability so a silent cap isn't an unprovable
  // one. See lib/affiliate/redirect.ts.
  | 'click_cap_reached'
  // Team decision 2026-08-01: vendor_owner/outlet_manager accounts cannot
  // earn affiliate commission. Not abuse either — an ineligible account,
  // not a malicious one — logged so a blocked commission is provable, same
  // reasoning as click_cap_reached. See lib/affiliate/vendor-role-guard.ts.
  | 'vendor_ineligible'
  // Live-found gap (2026-08-20): an admin confirming a fraud flag disables
  // the link (autoDisableLink()), but a click made BEFORE the disable can
  // still have its mw_ref cookie sitting in a different, legitimate buyer's
  // browser — that purchase completing afterward must not still pay out.
  // "Confirm & disable" means stop ALL future payouts from this link, not
  // just future clicks. See the LINK-DISABLED GUARD in attribution.ts.
  | 'link_disabled_at_payout';

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
 * Inserts a flag row. Never auto-disables — see the file-header note above;
 * every flag type is admin-review-only. Does not dedupe — callers that need
 * the 24h sweep dedupe window call hasRecentOpenFlag() first.
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

  return data.id as string;
}

async function logSweepFlag(service: SupabaseClient, input: LogFraudFlagInput): Promise<boolean> {
  if (!input.linkId || !input.userId) return false;
  const { data, error } = await service.rpc('log_affiliate_sweep_flag', {
    p_link_id: input.linkId,
    p_user_id: input.userId,
    p_flag_type: input.flagType,
    p_severity: input.severity,
    p_detail: input.detail,
  });
  if (error) throw new Error('affiliate_sweep_flag_write_unavailable');
  return typeof data === 'string';
}

/**
 * True if an OPEN flag of this type already exists for this link within the
 * last 24h. Exported for lib/affiliate/redirect.ts's click-cap flag, which
 * needs the exact same "one flag per link per 24h while the condition
 * persists" dedupe as the sweep-detected types below use internally.
 */
export async function hasRecentOpenFlag(service: SupabaseClient, linkId: string, flagType: FraudFlagType): Promise<boolean> {
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
  const { error } = await service.rpc('admin_set_affiliate_link_state', {
    p_link_id: linkId,
    p_actor_id: actorId,
    p_is_active: false,
    p_note: note,
  });
  if (error) throw error;
}

/**
 * Reverses autoDisableLink — sets is_active = true and writes an audit_logs
 * entry. Always a manual admin action (CLAUDE-PHASE2.md Section 4: "Admin
 * can re-enable it from the dashboard") — there is no automatic
 * re-enable. No-op if already active.
 */
export async function reactivateLink(service: SupabaseClient, linkId: string, actorId: string): Promise<void> {
  const { error } = await service.rpc('admin_set_affiliate_link_state', {
    p_link_id: linkId,
    p_actor_id: actorId,
    p_is_active: true,
    p_note: `admin re-enabled link ${linkId}`,
  });
  if (error) throw error;
}

export interface DisabledLink {
  linkId: string;
  userId: string;
  userName: string;
  affiliateCode: string;
}

export interface DisabledLinksPage {
  items: DisabledLink[];
  total: number;
  page: number;
  pageSize: number;
}

/** A bounded slice of currently-disabled links, for the admin re-enable list. */
export async function getDisabledLinks(service: SupabaseClient, page = 1): Promise<DisabledLinksPage> {
  const pageSize = 10;
  const { data: linksData, count, error } = await service
    .from('affiliate_links')
    .select('id, user_id, affiliate_code', { count: 'exact' })
    .eq('is_active', false)
    .order('id', { ascending: true })
    .range((page - 1) * pageSize, page * pageSize - 1);
  if (error) throw new Error('disabled_affiliate_links_unavailable');
  const links = linksData ?? [];
  if (!links.length) return { items: [], total: count ?? 0, page, pageSize };

  const userIds = [...new Set(links.map((l) => l.user_id))];
  const { data: usersData, error: usersError } = await service.from('users').select('id, full_name').in('id', userIds);
  if (usersError) throw new Error('disabled_affiliate_link_owners_unavailable');
  const usersById = new Map((usersData ?? []).map((u) => [u.id, u]));

  const items = links.map((l) => ({
    linkId: l.id,
    userId: l.user_id,
    userName: userDisplayName(usersById.get(l.user_id)),
    affiliateCode: l.affiliate_code,
  }));
  return { items, total: count ?? 0, page, pageSize };
}

export interface FraudSweepResult {
  linksScanned: number;
  flagsCreated: { linkId: string; flagType: FraudFlagType; severity: FraudSeverity }[];
  hasMore?: boolean;
  busy?: boolean;
}

/**
 * Scans every affiliate link for patterns a single conversion can't see.
 * Read-scale is fine for a demo-sized dataset (all clicks/attributions
 * fetched once, grouped in memory) — this is not meant to run per-request,
 * only from the admin "Run fraud sweep" button and from the clearing job.
 */
export async function runFraudSweep(service: SupabaseClient): Promise<FraudSweepResult> {
  const thresholds = await getFraudThresholds(service);
  const result: FraudSweepResult = { linksScanned: 0, flagsCreated: [], hasMore: false };
  const claimed = await service.rpc('claim_affiliate_job', {
    p_scope: 'fraud_sweep',
    p_cutoff: new Date().toISOString(),
    p_lease_seconds: 600,
  });
  if (claimed.error || !claimed.data || typeof claimed.data !== 'object') throw new Error('affiliate_fraud_sweep_claim_unavailable');
  const claim = claimed.data as Record<string, unknown>;
  if (claim.outcome === 'busy') return { ...result, busy: true, hasMore: true };
  if (claim.outcome !== 'claimed' || typeof claim.token !== 'string' || typeof claim.cutoff !== 'string') {
    throw new Error('affiliate_fraud_sweep_claim_invalid');
  }
  const token = claim.token;
  const cutoff = claim.cutoff;
  const velocityCutoff = new Date(new Date(cutoff).getTime() - thresholds.clickVelocityWindowMinutes * 60_000).toISOString();
  const batchSize = 50;
  const maxBatchesPerRun = 3;

  for (let batchNumber = 0; batchNumber < maxBatchesPerRun; batchNumber++) {
    const batch = await service.rpc('get_affiliate_fraud_sweep_batch', {
      p_token: token,
      p_velocity_cutoff: velocityCutoff,
      p_limit: batchSize,
    });
    if (batch.error || !Array.isArray(batch.data)) throw new Error('affiliate_fraud_sweep_batch_unavailable');
    const links = batch.data as Array<{
      id: string;
      user_id: string;
      is_active: boolean;
      created_at: string;
      total_clicks: number;
      recent_clicks: number;
      top_visitor_count: number;
      has_referral: boolean;
      ineligible_role: 'vendor_owner' | 'outlet_manager' | null;
    }>;

    for (const link of links) {
    // ── vendor_ineligible (deactivation cleanup, item 3) ─────────
    // Team decision 2026-08-01 — see lib/affiliate/vendor-role-guard.ts.
    // This is cleanup, not the security boundary: onOrderPaid() already
    // blocks the money independent of is_active, regardless of whether
    // this sweep has run yet. Only checked for still-active links — no
    // point re-flagging/re-disabling one already caught.
    if (link.is_active) {
      const ineligibleRole = link.ineligible_role;
      if (ineligibleRole) {
        if (await logSweepFlag(service, {
          linkId: link.id,
          userId: link.user_id,
          flagType: 'vendor_ineligible',
          severity: 'low',
          detail: { role: ineligibleRole, source: 'sweep' },
        })) {
          result.flagsCreated.push({ linkId: link.id, flagType: 'vendor_ineligible', severity: 'low' });
        }
        await autoDisableLink(service, link.id, `auto-disabled: link owner is ${ineligibleRole}, ineligible for affiliate commission`, null);
        continue; // nothing else to check on a link just deactivated for this reason
      }
    }

    // ── click_velocity ──────────────────────────────────────────
    const recentClicks = Number(link.recent_clicks);
    const totalClicks = Number(link.total_clicks);
    const topVisitorCount = Number(link.top_visitor_count);
    if (recentClicks > thresholds.clickVelocityMax) {
      const severity: FraudSeverity = recentClicks > thresholds.clickVelocityMax * 2 ? 'high' : 'medium';
      if (await logSweepFlag(service, {
          linkId: link.id,
          userId: link.user_id,
          flagType: 'click_velocity',
          severity,
          detail: {
            clicksInWindow: recentClicks,
            windowMinutes: thresholds.clickVelocityWindowMinutes,
            threshold: thresholds.clickVelocityMax,
          },
        })) {
        result.flagsCreated.push({ linkId: link.id, flagType: 'click_velocity', severity });
      }
    }

    // ── visitor_clustering ──────────────────────────────────────
    if (totalClicks >= thresholds.visitorClusteringMinClicks) {
      const ratio = totalClicks ? topVisitorCount / totalClicks : 0;
      if (topVisitorCount > 0 && ratio > thresholds.visitorClusteringRatio) {
        if (await logSweepFlag(service, {
            linkId: link.id,
            userId: link.user_id,
            flagType: 'visitor_clustering',
            severity: 'medium',
            detail: {
              totalClicks,
              topVisitorClicks: topVisitorCount,
              ratio: Number(ratio.toFixed(2)),
              threshold: thresholds.visitorClusteringRatio,
            },
          })) {
          result.flagsCreated.push({ linkId: link.id, flagType: 'visitor_clustering', severity: 'medium' });
        }
      }
    }

    // ── zero_conversion ─────────────────────────────────────────
    if (totalClicks >= thresholds.zeroConversionMinClicks) {
      if (!link.has_referral) {
        if (await logSweepFlag(service, {
            linkId: link.id,
            userId: link.user_id,
            flagType: 'zero_conversion',
            severity: 'medium',
          detail: { totalClicks, threshold: thresholds.zeroConversionMinClicks },
          })) {
          result.flagsCreated.push({ linkId: link.id, flagType: 'zero_conversion', severity: 'medium' });
        }
      }
    }
    }

    result.linksScanned += links.length;
    const complete = links.length < batchSize;
    const last = links.at(-1);
    const releaseLease = complete || batchNumber === maxBatchesPerRun - 1;
    const advanced = await service.rpc('advance_affiliate_job', {
      p_scope: 'fraud_sweep',
      p_token: token,
      p_created_at: last?.created_at ?? null,
      p_id: last?.id ?? null,
      p_complete: complete,
      p_release_lease: releaseLease,
    });
    if (advanced.error || advanced.data !== true) throw new Error('affiliate_fraud_sweep_checkpoint_unavailable');
    if (complete) return result;
    if (releaseLease) {
      result.hasMore = true;
      return result;
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

export interface FraudFlagPageOptions {
  page: number;
  pageSize: 10 | 25 | 50;
  flagType: FraudFlagType | null;
  severity: FraudSeverity | null;
  status: FraudFlagStatus | null;
  search: string;
}

export interface FraudFlagPage {
  items: FraudFlagRow[];
  total: number;
  page: number;
  pageSize: number;
}

export interface FraudCounters {
  selfReferralsBlocked: number;
  duplicatePayoutsPrevented: number;
  openFlags: number;
  linksDisabled: number;
}

function userDisplayName(row: { full_name: string | null } | undefined): string {
  return row?.full_name?.trim() || 'Unknown user';
}

/** Filter and page the admin queue in PostgreSQL; never fetch the full flag history for the list UI. */
export async function getFraudFlagPage(service: SupabaseClient, options: FraudFlagPageOptions): Promise<FraudFlagPage> {
  const { data, error } = await service.rpc('get_affiliate_fraud_flag_page', {
    p_page: options.page,
    p_page_size: options.pageSize,
    p_flag_type: options.flagType,
    p_severity: options.severity,
    p_status: options.status,
    p_search: options.search,
  });
  if (error || !data || typeof data !== 'object') throw new Error('affiliate_fraud_flag_page_unavailable');

  const payload = data as { items?: unknown; total?: unknown; page?: unknown; page_size?: unknown };
  if (!Array.isArray(payload.items) || typeof payload.total !== 'number'
    || typeof payload.page !== 'number' || typeof payload.page_size !== 'number') {
    throw new Error('affiliate_fraud_flag_page_invalid');
  }

  const items = payload.items.map((raw): FraudFlagRow => {
    const item = raw as Record<string, unknown>;
    const userId = typeof item.user_id === 'string' ? item.user_id : null;
    return {
      id: String(item.id),
      linkId: typeof item.link_id === 'string' ? item.link_id : null,
      userId,
      userName: typeof item.user_name === 'string' ? item.user_name : 'Unknown user',
      affiliateCode: typeof item.affiliate_code === 'string' ? item.affiliate_code : null,
      orderId: typeof item.order_id === 'string' ? item.order_id : null,
      flagType: item.flag_type as FraudFlagType,
      severity: item.severity as FraudSeverity,
      detail: typeof item.detail === 'object' && item.detail !== null ? item.detail as Record<string, unknown> : null,
      status: item.status as FraudFlagStatus,
      createdAt: String(item.created_at),
      reviewedAt: typeof item.reviewed_at === 'string' ? item.reviewed_at : null,
    };
  });
  return { items, total: payload.total, page: payload.page, pageSize: payload.page_size };
}

/** The "X self-referrals blocked, Y duplicate payouts prevented" counter — see CLAUDE-PHASE2.md Section 4. */
export async function getFraudCounters(service: SupabaseClient): Promise<FraudCounters> {
  const [selfReferral, duplicateAttribution, openFlags, disabledLinks] = await Promise.all([
    service.from('affiliate_fraud_flags').select('id', { count: 'exact', head: true }).eq('flag_type', 'self_referral'),
    service.from('affiliate_fraud_flags').select('id', { count: 'exact', head: true }).eq('flag_type', 'duplicate_attribution'),
    service.from('affiliate_fraud_flags').select('id', { count: 'exact', head: true }).eq('status', 'open'),
    service.from('affiliate_links').select('id', { count: 'exact', head: true }).eq('is_active', false),
  ]);
  const results = [selfReferral, duplicateAttribution, openFlags, disabledLinks];
  if (results.some((result) => result.error)) throw new Error('affiliate_fraud_counters_unavailable');

  return {
    selfReferralsBlocked: selfReferral.count ?? 0,
    duplicatePayoutsPrevented: duplicateAttribution.count ?? 0,
    openFlags: openFlags.count ?? 0,
    linksDisabled: disabledLinks.count ?? 0,
  };
}
