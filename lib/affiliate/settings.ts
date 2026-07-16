// P4 — Shared platform_settings reads.

import type { SupabaseClient } from '@supabase/supabase-js';

const DEFAULT_COOKIE_DAYS = 30;
const DEFAULT_CLEARANCE_DAYS = 7;
const DEFAULT_MONTHLY_CLICK_CAP = 50;

const DEFAULT_FRAUD_THRESHOLDS: FraudThresholds = {
  clickVelocityMax: 20,
  clickVelocityWindowMinutes: 60,
  visitorClusteringMinClicks: 10,
  visitorClusteringRatio: 0.5,
  zeroConversionMinClicks: 50,
  selfReferralAutoDisableCount: 3,
  selfReferralAutoDisableWindowDays: 30,
};

/** Reads platform_settings['affiliate.cookie_days'], defaulting to 30 if missing/invalid. */
export async function getAttributionCookieDays(service: SupabaseClient): Promise<number> {
  const { data } = await service
    .from('platform_settings')
    .select('value')
    .eq('key', 'affiliate.cookie_days')
    .maybeSingle();
  const parsed = data ? parseInt(data.value, 10) : NaN;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_COOKIE_DAYS;
}

/**
 * Reads platform_settings['wallet.clearance_days'], defaulting to 7 if
 * missing/invalid. Same key the recommendation-commission system already
 * seeds and describes ("Days before pending reward clears to available") —
 * reused here rather than adding a second, affiliate-specific setting.
 */
export async function getClearanceDays(service: SupabaseClient): Promise<number> {
  const { data } = await service
    .from('platform_settings')
    .select('value')
    .eq('key', 'wallet.clearance_days')
    .maybeSingle();
  const parsed = data ? parseInt(data.value, 10) : NaN;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_CLEARANCE_DAYS;
}

/**
 * Reads platform_settings['affiliate.monthly_click_cap'], defaulting to 50
 * if missing/invalid — the limited (non-full-KYC) affiliate tier's trial
 * click allowance, §8.3. See lib/affiliate/redirect.ts for how this is
 * enforced (a rolling 30-day window, not a calendar month).
 */
export async function getMonthlyClickCap(service: SupabaseClient): Promise<number> {
  const { data } = await service
    .from('platform_settings')
    .select('value')
    .eq('key', 'affiliate.monthly_click_cap')
    .maybeSingle();
  const parsed = data ? parseInt(data.value, 10) : NaN;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_MONTHLY_CLICK_CAP;
}

export interface FraudThresholds {
  clickVelocityMax: number;
  clickVelocityWindowMinutes: number;
  visitorClusteringMinClicks: number;
  visitorClusteringRatio: number;
  zeroConversionMinClicks: number;
  /** How many self_referral flags on one link within the window below before it's auto-disabled. */
  selfReferralAutoDisableCount: number;
  selfReferralAutoDisableWindowDays: number;
}

/**
 * Reads the fraud.* platform_settings rows seeded by migration 014
 * (CLAUDE-PHASE2.md Feature C), falling back per-key to the same defaults
 * the migration seeds, in case a key is missing or holds a non-numeric
 * value. Never hardcoded in lib/affiliate/fraud.ts itself — see that file.
 */
export async function getFraudThresholds(service: SupabaseClient): Promise<FraudThresholds> {
  const { data } = await service
    .from('platform_settings')
    .select('key, value')
    .in('key', [
      'fraud.click_velocity_max',
      'fraud.click_velocity_window_minutes',
      'fraud.visitor_clustering_min_clicks',
      'fraud.visitor_clustering_ratio',
      'fraud.zero_conversion_min_clicks',
      'fraud.self_referral_auto_disable_count',
      'fraud.self_referral_auto_disable_window_days',
    ]);

  const values = new Map((data ?? []).map((r) => [r.key, r.value]));
  const num = (key: string, fallback: number) => {
    const parsed = parseFloat(values.get(key) ?? '');
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
  };

  return {
    clickVelocityMax: num('fraud.click_velocity_max', DEFAULT_FRAUD_THRESHOLDS.clickVelocityMax),
    clickVelocityWindowMinutes: num('fraud.click_velocity_window_minutes', DEFAULT_FRAUD_THRESHOLDS.clickVelocityWindowMinutes),
    visitorClusteringMinClicks: num('fraud.visitor_clustering_min_clicks', DEFAULT_FRAUD_THRESHOLDS.visitorClusteringMinClicks),
    visitorClusteringRatio: num('fraud.visitor_clustering_ratio', DEFAULT_FRAUD_THRESHOLDS.visitorClusteringRatio),
    zeroConversionMinClicks: num('fraud.zero_conversion_min_clicks', DEFAULT_FRAUD_THRESHOLDS.zeroConversionMinClicks),
    selfReferralAutoDisableCount: num('fraud.self_referral_auto_disable_count', DEFAULT_FRAUD_THRESHOLDS.selfReferralAutoDisableCount),
    selfReferralAutoDisableWindowDays: num(
      'fraud.self_referral_auto_disable_window_days',
      DEFAULT_FRAUD_THRESHOLDS.selfReferralAutoDisableWindowDays,
    ),
  };
}
