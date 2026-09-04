// P4 — Member 4: AI performance insight. CLAUDE-FUNNEL-AI.md Part 2 — the
// module's third AI feature (chatbot, ticket classification, this).
//
// Numbers in, sentence out — same PII-safe pattern as the admin-ai module
// (lib/admin-ai/queries.ts's safe-aggregate-registry design). The LLM never
// sees raw rows, only the aggregates the caller already computed elsewhere
// (lib/affiliate/stats.ts / admin-stats.ts). callGemini() itself redacts on
// top of that as a hard-boundary safety net, but nothing here should ever
// contain PII in the first place — admin anomaly narration uses
// affiliate_code (public by design — it's literally meant to be shared),
// never a user's name or email.
//
// Falls back to a deterministic, rule-based line if Gemini is unavailable
// (no LLM_API_KEY, or any API failure) — the Insights card must never be
// blank or broken because the LLM is down.

import { callGemini } from '@/lib/admin-ai/gemini';
import { formatMYR } from '@/lib/i18n/format';

export interface InsightPlatformRow {
  platform: string;
  shares: number;
  clicks: number | null;
  conversions: number | null;
}

export interface UserInsightStats {
  totalShares: number;
  totalClicks: number;
  totalConversions: number;
  conversionRate: number | null; // conversions / clicks
  earningsPending: number;
  earningsAvailable: number;
  tierName: string;
  referralsToNextTier: number | null;
  byPlatform: InsightPlatformRow[];
  byProduct: { productName: string; clicks: number; conversions: number; earned: number }[];
}

export interface AdminAnomaly {
  affiliateCode: string;
  clicks: number;
  conversions: number;
}

export interface AdminInsightStats {
  totalAffiliates: number;
  totalClicks: number;
  totalConversions: number;
  totalCommission: number;
  byPlatform: InsightPlatformRow[];
  topAffiliates: { affiliateCode: string; referrals: number; commission: number; tierName: string }[];
  /** High clicks, zero conversions — the same shape as the zero_conversion fraud flag. */
  anomalies: AdminAnomaly[];
}

const USER_SYSTEM_PROMPT = `You are an analytics assistant for a Malaysian tourism affiliate dashboard.
Given these performance stats, write 2-3 short, specific, actionable sentences for the affiliate.
Focus on: their best channel, their best product, and one concrete suggestion to earn more. Use
only the numbers provided. Never invent figures. All money amounts are in Malaysian Ringgit — write
them as "RM12.50", never "$12.50" or any other currency symbol. Plain, encouraging, concise.`;

const ADMIN_SYSTEM_PROMPT = `You are an analytics assistant for a Malaysian tourism marketplace's
admin team, summarising platform-wide affiliate performance. Given these aggregate stats, write 2-3
short, specific sentences: which channel or affiliate drives the most conversions, and flag any
anomaly in words (e.g. an affiliate with many clicks and zero conversions — possible bot traffic,
worth reviewing). Affiliates are identified only by their affiliate code (e.g. "AF-7K2M9P") — never
refer to anyone by name. Use only the numbers provided. Never invent figures. All money amounts are
in Malaysian Ringgit — write them as "RM12.50", never "$12.50" or any other currency symbol. Plain,
concise, professional.`;

export async function generateUserInsight(stats: UserInsightStats): Promise<string> {
  return callGemini(USER_SYSTEM_PROMPT, JSON.stringify(stats), { temperature: 0.4, maxOutputTokens: 220 });
}

export async function generateAdminInsight(stats: AdminInsightStats): Promise<string> {
  return callGemini(ADMIN_SYSTEM_PROMPT, JSON.stringify(stats), { temperature: 0.4, maxOutputTokens: 220 });
}

// ── Rule-based fallback ──────────────────────────────────────────────────

function platformLabel(platform: string): string {
  if (platform === 'native') return 'the share sheet';
  if (platform === 'copy_link') return 'copied links';
  return platform;
}

export function ruleBasedUserInsight(stats: UserInsightStats): string {
  const parts: string[] = [];
  const topPlatform = [...stats.byPlatform].sort((a, b) => b.shares - a.shares)[0];
  if (topPlatform && topPlatform.shares > 0) {
    parts.push(`${platformLabel(topPlatform.platform)[0].toUpperCase()}${platformLabel(topPlatform.platform).slice(1)} is your top channel by shares (${topPlatform.shares}).`);
  }
  const topProduct = [...stats.byProduct].sort((a, b) => b.earned - a.earned)[0];
  if (topProduct && topProduct.earned > 0) {
    parts.push(`${topProduct.productName} is your best-earning activity so far (${formatMYR(topProduct.earned)}).`);
  }
  if (stats.referralsToNextTier !== null && stats.referralsToNextTier > 0) {
    parts.push(`You're ${stats.referralsToNextTier} referral${stats.referralsToNextTier === 1 ? '' : 's'} away from your next tier.`);
  }
  if (parts.length === 0) parts.push('Share your affiliate link to start building your performance history.');
  return parts.join(' ');
}

export function ruleBasedAdminInsight(stats: AdminInsightStats): string {
  const parts: string[] = [];
  const topAffiliate = [...stats.topAffiliates].sort((a, b) => b.commission - a.commission)[0];
  if (topAffiliate && topAffiliate.commission > 0) {
    parts.push(`${topAffiliate.affiliateCode} is the top earner (${formatMYR(topAffiliate.commission)}, ${topAffiliate.referrals} referral${topAffiliate.referrals === 1 ? '' : 's'}).`);
  }
  const topPlatform = [...stats.byPlatform].sort((a, b) => b.shares - a.shares)[0];
  if (topPlatform && topPlatform.shares > 0) {
    parts.push(`${platformLabel(topPlatform.platform)[0].toUpperCase()}${platformLabel(topPlatform.platform).slice(1)} drives the most shares platform-wide.`);
  }
  if (stats.anomalies.length > 0) {
    const a = stats.anomalies[0];
    parts.push(`${a.affiliateCode} has ${a.clicks} clicks and 0 conversions — likely bot traffic, worth reviewing.`);
  }
  if (parts.length === 0) parts.push('No affiliate activity to summarise yet.');
  return parts.join(' ');
}
