// P4 — Member 4: Affiliate "Next Best Action" Copilot. CLAUDE-AFFILIATE-COPILOT.md.
//
// Part 1: signal gathering (getCopilotSignals) — every number comes from a
// real query, nothing invented. Part 2: prescriptive generation
// (generateCopilotActions) — the model phrases signals, never invents one;
// every action is cross-checked against the real signal it cites. Part 3:
// trilingual caption drafting (draftCopilotCaption) — same discipline,
// applied to one specific real listing's real facts.
//
// Deliberately a SIBLING of lib/affiliate/insight.ts, not an extension of
// it — insight.ts is dual-scope (user AND admin platform-wide narration);
// this is user-scope only ("a user's copilot reads only their own
// performance"). Reuses lib/affiliate/stats.ts::getAffiliateStats() for the
// personal-performance signals instead of re-querying what it already
// computes — only the platform-wide "opportunities" signal needs a genuinely
// new query, since getAffiliateStats() only ever returns the caller's own
// data.

import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { createServiceClient } from '@/lib/supabase/service';
import { callGemini } from '@/lib/admin-ai/gemini';
import { formatMYR } from '@/lib/i18n/format';
import type { ChatLanguage } from '@/lib/chatbot/language';
import { getAffiliateStats, type AffiliateProductStat, type AffiliateCampaignStat } from './stats';
import type { FunnelPlatformRow } from './funnel';

// Below this many clicks, a conversion rate is noise (e.g. 1 click / 1
// conversion = "100%") — omit the listing from a ranked signal entirely
// rather than let a lucky single click look like a pattern.
const MIN_CLICKS_FOR_PERSONAL_SIGNAL = 3;
// Platform-wide bar is the same shape but scoped to "this listing, across
// every affiliate" — kept equal to the personal bar for now; revisit if the
// affiliate program's real click volume grows enough that a higher bar
// becomes meaningful.
const MIN_CLICKS_FOR_PLATFORM_SIGNAL = 3;
const MIN_RATING_FOR_FALLBACK_OPPORTUNITY = 4;
const MIN_REVIEWS_FOR_FALLBACK_OPPORTUNITY = 3;
// A refund/cancellation is only a real pattern, not bad luck, once BOTH bars
// clear: at least 2 reversed attributions, AND at least a third of this
// listing's attributions ended up reversed.
const MIN_REVERSED_FOR_REFUND_SIGNAL = 2;
const MIN_REFUND_RATE_FOR_SIGNAL = 0.3;

const TOP_CONVERTING_CAP = 3;
const UNDERPERFORMING_CAP = 3;
const OPPORTUNITY_CAP = 4;
const REFUND_RISK_CAP = 2;

export interface CopilotListingPerformance extends AffiliateProductStat {
  /** referrals / clicks, 0..1. null if clicks = 0 (nothing to divide by — never fabricated as 0%). */
  conversionRate: number | null;
}

export interface OpportunityListing {
  productId: string;
  productName: string;
  /** Which real signal grounds this suggestion — the prompt/UI must say which, never blend them into one unexplained number. */
  reason: 'platform_conversion' | 'highly_rated';
  /** Present only when reason = 'platform_conversion'. */
  platformConversionRate?: number;
  platformClicks?: number;
  /** Present only when reason = 'highly_rated'. */
  rating?: number;
  reviewCount?: number;
}

export interface RefundRiskListing extends AffiliateProductStat {
  /** reversedReferrals / (referrals + reversedReferrals), 0..1 — this listing's own rate, not a platform average. */
  refundRate: number;
}

export interface CopilotSignals {
  affiliateCode: string | null;
  /** False = this affiliate has never had a click on any link — drives the "share a few links first" empty state, never invented advice. */
  hasActivity: boolean;
  /** This affiliate's own best-converting listings, ranked, clicks-floor applied. */
  topConverting: CopilotListingPerformance[];
  /** This affiliate's own listings with real click volume but weak/no conversion — "shared interest but weak result." */
  underperforming: CopilotListingPerformance[];
  /** Reused as-is from the funnel — same honesty flag: clicks/conversions are null per-platform until at least one click has a recorded source. */
  byChannel: FunnelPlatformRow[];
  byCampaign: AffiliateCampaignStat[];
  /** Real, active, listings this affiliate has not yet driven any click to. Capped. Empty is a valid, honest result. */
  opportunities: OpportunityListing[];
  /** This affiliate's own listings where a real, meaningful share of referrals were later reversed (order cancelled/refunded) — a heads-up, not blame. Capped. Empty is a valid, honest result. */
  refundRisk: RefundRiskListing[];
  sourceTrackingActive: boolean;
}

function withConversionRate(product: AffiliateProductStat): CopilotListingPerformance {
  return { ...product, conversionRate: product.clicks > 0 ? product.referrals / product.clicks : null };
}

/**
 * Platform-wide click/conversion counts per product, EXCLUDING any product
 * this affiliate has already driven a click to. Service-role client always —
 * affiliate_clicks/affiliate_attributions carry own-link-only RLS, and this
 * is deliberately reading OTHER affiliates' aggregate numbers (never their
 * identity) to find what's generically working, same category of read as
 * lib/affiliate/admin-stats.ts's platform-wide aggregation.
 */
async function findConvertingOpportunities(
  excludeProductIds: Set<string>,
  limit: number,
): Promise<OpportunityListing[]> {
  const service = createServiceClient();

  const { data: clicks } = await service
    .from('affiliate_clicks')
    .select('id, target_id')
    .eq('target_type', 'product');
  const clickRows = clicks ?? [];
  if (clickRows.length === 0) return [];

  const clicksByProduct = new Map<string, number>();
  const clickIdToProduct = new Map<string, string>();
  for (const row of clickRows) {
    if (!row.target_id) continue;
    clicksByProduct.set(row.target_id, (clicksByProduct.get(row.target_id) ?? 0) + 1);
    clickIdToProduct.set(row.id, row.target_id);
  }

  const clickIds = [...clickIdToProduct.keys()];
  const { data: attributions } = clickIds.length
    ? await service.from('affiliate_attributions').select('click_id, status').in('click_id', clickIds).in('status', ['pending', 'confirmed'])
    : { data: [] as { click_id: string; status: string }[] };

  const conversionsByProduct = new Map<string, number>();
  for (const row of attributions ?? []) {
    const productId = clickIdToProduct.get(row.click_id);
    if (!productId) continue;
    conversionsByProduct.set(productId, (conversionsByProduct.get(productId) ?? 0) + 1);
  }

  const ranked = [...clicksByProduct.entries()]
    .filter(([productId, clickCount]) => clickCount >= MIN_CLICKS_FOR_PLATFORM_SIGNAL && !excludeProductIds.has(productId))
    .map(([productId, clickCount]) => ({
      productId,
      clicks: clickCount,
      conversionRate: (conversionsByProduct.get(productId) ?? 0) / clickCount,
    }))
    .sort((a, b) => b.conversionRate - a.conversionRate)
    .slice(0, limit);

  if (ranked.length === 0) return [];

  const { data: products } = await service
    .from('products')
    .select('id, name')
    .in('id', ranked.map((r) => r.productId))
    .eq('status', 'active')
    .eq('review_status', 'approved');
  const nameById = new Map((products ?? []).map((p) => [p.id, p.name as string]));

  // A ranked click-leader might since have gone inactive/unapproved — drop
  // it rather than suggest a listing that isn't really shareable right now.
  return ranked
    .filter((r) => nameById.has(r.productId))
    .map((r) => ({
      productId: r.productId,
      productName: nameById.get(r.productId)!,
      reason: 'platform_conversion' as const,
      platformConversionRate: Math.round(r.conversionRate * 1000) / 1000,
      platformClicks: r.clicks,
    }));
}

/**
 * Fallback opportunity source when platform click/conversion data is too
 * thin to fill the cap (a young affiliate program has little of it) —
 * highly-rated, active, currently-unshared listings. Still 100% real data,
 * just a different real signal than conversion rate.
 */
async function findHighlyRatedOpportunities(
  excludeProductIds: Set<string>,
  limit: number,
): Promise<OpportunityListing[]> {
  if (limit <= 0) return [];
  const service = createServiceClient();

  const { data: metrics } = await service
    .from('product_review_metrics')
    .select('product_id, rating, reviews')
    .gte('rating', MIN_RATING_FOR_FALLBACK_OPPORTUNITY)
    .gte('reviews', MIN_REVIEWS_FOR_FALLBACK_OPPORTUNITY)
    .order('rating', { ascending: false })
    .order('reviews', { ascending: false })
    .limit(limit + excludeProductIds.size); // over-fetch to survive the exclude-filter below

  const candidates = (metrics ?? []).filter((m) => !excludeProductIds.has(m.product_id)).slice(0, limit);
  if (candidates.length === 0) return [];

  const { data: products } = await service
    .from('products')
    .select('id, name')
    .in('id', candidates.map((c) => c.product_id))
    .eq('status', 'active')
    .eq('review_status', 'approved');
  const nameById = new Map((products ?? []).map((p) => [p.id, p.name as string]));

  return candidates
    .filter((c) => nameById.has(c.product_id))
    .map((c) => ({
      productId: c.product_id,
      productName: nameById.get(c.product_id)!,
      reason: 'highly_rated' as const,
      rating: Number(c.rating),
      reviewCount: Number(c.reviews),
    }));
}

/**
 * This affiliate's own listings where refunds/cancellations are a real
 * pattern, not bad luck — reuses stats.byProduct's reversedReferrals (already
 * computed from data getAffiliateStats() already fetched; no new query).
 */
function findRefundRiskListings(byProduct: AffiliateProductStat[]): RefundRiskListing[] {
  return byProduct
    .filter((p) => p.reversedReferrals >= MIN_REVERSED_FOR_REFUND_SIGNAL)
    .map((p) => ({ ...p, refundRate: p.reversedReferrals / (p.referrals + p.reversedReferrals) }))
    .filter((p) => p.refundRate >= MIN_REFUND_RATE_FOR_SIGNAL)
    .sort((a, b) => b.refundRate - a.refundRate || b.reversedReferrals - a.reversedReferrals)
    .slice(0, REFUND_RISK_CAP);
}

export async function getCopilotSignals(service: SupabaseClient, userId: string): Promise<CopilotSignals> {
  const stats = await getAffiliateStats(service, userId);

  const hasActivity = stats.totals.clicks > 0 || stats.byProduct.length > 0;

  const performances = stats.byProduct.map(withConversionRate);
  const eligibleForRanking = performances.filter((p) => p.clicks >= MIN_CLICKS_FOR_PERSONAL_SIGNAL);

  const topConverting = [...eligibleForRanking]
    .filter((p) => (p.conversionRate ?? 0) > 0)
    .sort((a, b) => (b.conversionRate ?? 0) - (a.conversionRate ?? 0))
    .slice(0, TOP_CONVERTING_CAP);

  const underperforming = [...eligibleForRanking]
    .filter((p) => p.referrals === 0)
    .sort((a, b) => b.clicks - a.clicks)
    .slice(0, UNDERPERFORMING_CAP);

  const alreadyShared = new Set(stats.byProduct.map((p) => p.productId));
  const converting = await findConvertingOpportunities(alreadyShared, OPPORTUNITY_CAP);
  const excludeForFallback = new Set([...alreadyShared, ...converting.map((o) => o.productId)]);
  const highlyRated = await findHighlyRatedOpportunities(excludeForFallback, OPPORTUNITY_CAP - converting.length);
  const opportunities = [...converting, ...highlyRated];

  const refundRisk = findRefundRiskListings(stats.byProduct);

  return {
    affiliateCode: stats.affiliateCode,
    hasActivity,
    topConverting,
    underperforming,
    byChannel: stats.funnel.byPlatform,
    byCampaign: stats.byCampaign,
    opportunities,
    refundRisk,
    sourceTrackingActive: stats.funnel.sourceTrackingActive,
  };
}

// ── Part 2: prescriptive generation ─────────────────────────────────────
// The model phrases; it never computes or invents a number, listing, or
// channel. Every action the model returns is cross-checked against the real
// signal it claims to cite (validateActions()) before being shown — a
// hallucinated reference is dropped, never surfaced with a broken deep-link
// or a fabricated id.

const LANGUAGE_NAME: Record<ChatLanguage, string> = {
  en: 'English',
  bm: 'Bahasa Melayu',
  zh: 'Simplified Chinese',
};

export type CopilotActionKind = 'share_listing' | 'try_channel' | 'reconsider_listing' | 'refund_risk' | 'general';

export interface CopilotAction {
  kind: CopilotActionKind;
  message: string;
  /** Present for share_listing/reconsider_listing/refund_risk — always a real id, validated against the signals. */
  productId?: string;
  productName?: string;
  /** Present for try_channel — always a real platform present in byChannel. */
  platform?: string;
}

export interface CopilotActionsResult {
  actions: CopilotAction[];
  mode: 'llm' | 'rule-based' | 'no-activity';
}

const MAX_ACTIONS = 4;

const llmActionSchema = z.object({
  kind: z.enum(['share_listing', 'try_channel', 'reconsider_listing', 'refund_risk', 'general']),
  message: z.string().min(1),
  productId: z.string().optional(),
  platform: z.string().optional(),
}).strict();
const llmResponseSchema = z.object({ actions: z.array(llmActionSchema) }).strict();

function extractJson(text: string): unknown {
  const stripped = text.replace(/```json\s*|```/g, '').trim();
  return JSON.parse(stripped);
}

function buildCopilotSystemPrompt(lang: ChatLanguage): string {
  return `You are an assistant helping an affiliate marketer improve their referral performance on a Malaysian tourism platform, MyWisata.

Below is their REAL performance data (already computed — treat every number as fact, never change or invent a number, listing, or channel not present in it).

Suggest 2-4 concrete, actionable next steps as a JSON object. Ground every suggestion strictly in the data provided:
- "share_listing" suggestions: the productId MUST be one of the ids in the "opportunities" list — never suggest a listing from anywhere else, and never invent one.
- "try_channel" suggestions: the platform MUST be one of the platforms in "byChannel" — point out a channel/campaign that is genuinely working better for them, using their real numbers.
- "reconsider_listing" suggestions: the productId MUST be one of the ids in "underperforming" — a listing getting clicks but not converting, worth rethinking.
- "refund_risk" suggestions: the productId MUST be one of the ids in "refundRisk" — a listing where a real, meaningful share of this affiliate's own referrals were later cancelled/refunded. Phrase this as a neutral heads-up ("a number of orders from this listing were later refunded — worth double-checking the listing matches what's delivered"), never as blame on the affiliate and never guessing WHY it happened beyond what the data shows.
- "general" suggestions: no listing/channel reference needed, but still grounded in the numbers given.

NEVER promise or imply guaranteed earnings ("you'll earn RM50") — frame everything as an opportunity or observation, never a result ("this listing is converting well for other affiliates," "your Story shares convert better than your WhatsApp shares"). NEVER invent a listing, number, platform, or fact that is not in the data below. If the data is too thin to support a point, omit that point rather than guess — fewer than 4 honest actions is correct, never pad with invented ones.

All money amounts are already in Malaysian Ringgit — if you reference an amount, write it as "RM12.50", never "$12.50" or another currency symbol.

Reply in ${LANGUAGE_NAME[lang]}, for every message field.

Respond with ONLY strict JSON, no markdown, no commentary, in this exact shape:
{"actions": [{"kind": "share_listing" | "try_channel" | "reconsider_listing" | "refund_risk" | "general", "message": "<suggestion, in the target language>", "productId": "<only for share_listing/reconsider_listing/refund_risk>", "platform": "<only for try_channel>"}]}`;
}

function validateActions(raw: z.infer<typeof llmActionSchema>[], signals: CopilotSignals): CopilotAction[] {
  const opportunityNames = new Map(signals.opportunities.map((o) => [o.productId, o.productName]));
  const underperformingNames = new Map(signals.underperforming.map((p) => [p.productId, p.productName]));
  const refundRiskNames = new Map(signals.refundRisk.map((p) => [p.productId, p.productName]));
  const channelPlatforms = new Set(signals.byChannel.map((c) => c.platform));

  const validated: CopilotAction[] = [];
  for (const action of raw) {
    if (action.kind === 'share_listing') {
      if (!action.productId || !opportunityNames.has(action.productId)) continue;
      validated.push({ kind: action.kind, message: action.message, productId: action.productId, productName: opportunityNames.get(action.productId) });
    } else if (action.kind === 'reconsider_listing') {
      if (!action.productId || !underperformingNames.has(action.productId)) continue;
      validated.push({ kind: action.kind, message: action.message, productId: action.productId, productName: underperformingNames.get(action.productId) });
    } else if (action.kind === 'refund_risk') {
      if (!action.productId || !refundRiskNames.has(action.productId)) continue;
      validated.push({ kind: action.kind, message: action.message, productId: action.productId, productName: refundRiskNames.get(action.productId) });
    } else if (action.kind === 'try_channel') {
      if (!action.platform || !channelPlatforms.has(action.platform)) continue;
      validated.push({ kind: action.kind, message: action.message, platform: action.platform });
    } else {
      validated.push({ kind: 'general', message: action.message });
    }
  }
  return validated.slice(0, MAX_ACTIONS);
}

/**
 * Deterministic fallback — same discipline as
 * lib/affiliate/insight.ts::ruleBasedUserInsight(): the copilot must never
 * be blank/broken just because Gemini is unavailable. Always English (no
 * translation available without the LLM) — up to MAX_ACTIONS real, grounded
 * actions straight from the signals.
 */
export function ruleBasedCopilotActions(signals: CopilotSignals): CopilotAction[] {
  const actions: CopilotAction[] = [];

  const topOpportunity = signals.opportunities[0];
  if (topOpportunity) {
    const reasonText = topOpportunity.reason === 'platform_conversion'
      ? `it's converting well for other affiliates (${Math.round((topOpportunity.platformConversionRate ?? 0) * 100)}% of clicks)`
      : `it's highly rated (${topOpportunity.rating}★, ${topOpportunity.reviewCount} reviews)`;
    actions.push({ kind: 'share_listing', message: `Consider sharing "${topOpportunity.productName}" — ${reasonText}.`, productId: topOpportunity.productId, productName: topOpportunity.productName });
  }

  const topRefundRisk = signals.refundRisk[0];
  if (topRefundRisk) {
    actions.push({ kind: 'refund_risk', message: `${topRefundRisk.reversedReferrals} of "${topRefundRisk.productName}"'s recent orders from your links were later cancelled or refunded — worth checking the listing matches what's delivered.`, productId: topRefundRisk.productId, productName: topRefundRisk.productName });
  }

  const bestChannel = [...signals.byChannel].filter((c) => (c.clicks ?? 0) > 0).sort((a, b) => (b.conversions ?? 0) - (a.conversions ?? 0))[0];
  if (bestChannel && (bestChannel.conversions ?? 0) > 0) {
    actions.push({ kind: 'try_channel', message: `Your "${bestChannel.platform}" shares are converting — worth using more.`, platform: bestChannel.platform });
  }

  const topUnderperforming = signals.underperforming[0];
  if (topUnderperforming) {
    actions.push({ kind: 'reconsider_listing', message: `"${topUnderperforming.productName}" has ${topUnderperforming.clicks} clicks but no conversions yet — might be worth a different caption or channel.`, productId: topUnderperforming.productId, productName: topUnderperforming.productName });
  }

  const topCampaign = [...signals.byCampaign].filter((c) => c.campaign && c.earnings > 0).sort((a, b) => b.earnings - a.earnings)[0];
  if (topCampaign) {
    actions.push({ kind: 'general', message: `Your "${topCampaign.campaign}" campaign has earned ${formatMYR(topCampaign.earnings)} so far — tagging more shares with it could help you see what's working.` });
  }

  if (actions.length === 0) {
    actions.push({ kind: 'general', message: 'Share a few more links to start building performance data — suggestions will appear once there is enough to go on.' });
  }

  return actions.slice(0, MAX_ACTIONS);
}

/**
 * Part 2 — prescriptive generation. Falls back to a deterministic
 * rule-based result if Gemini is unavailable, returns invalid JSON, or
 * every one of its actions fails grounding validation — the copilot must
 * never be blank or broken because the LLM is down.
 */
export async function generateCopilotActions(signals: CopilotSignals, lang: ChatLanguage): Promise<CopilotActionsResult> {
  if (!signals.hasActivity) {
    return {
      actions: [{ kind: 'general', message: "Share your affiliate link a few times to start building performance history — we'll suggest what to do next once there's data to work from." }],
      mode: 'no-activity',
    };
  }

  try {
    const payload = {
      topConverting: signals.topConverting,
      underperforming: signals.underperforming,
      byChannel: signals.byChannel,
      byCampaign: signals.byCampaign,
      opportunities: signals.opportunities,
    };
    const raw = await callGemini(buildCopilotSystemPrompt(lang), JSON.stringify(payload), { temperature: 0.4, maxOutputTokens: 500 });
    const parsed = llmResponseSchema.safeParse(extractJson(raw));
    if (!parsed.success) throw new Error('copilot LLM response failed schema validation');

    const validated = validateActions(parsed.data.actions, signals);
    if (validated.length === 0) throw new Error('copilot LLM response had no valid actions after grounding checks');

    return { actions: validated, mode: 'llm' };
  } catch (error) {
    console.error('[affiliate] copilot generation failed, using rule-based fallback', error instanceof Error ? error.message : error);
    return { actions: ruleBasedCopilotActions(signals), mode: 'rule-based' };
  }
}

// ── Part 3: trilingual caption drafting ─────────────────────────────────
// Turns "you should share X" into ready-to-post copy for X. Re-fetches the
// listing's own real, live facts independently (never trusts a caller-
// supplied description/price) — the same defensive pattern as
// lib/vendors/approval-draft.ts and lib/recommendations/invite-draft.ts:
// given real inputs, produce a draft; the caller is responsible for
// deciding who's allowed to ask for a caption on which listing, this
// function's own job is only "never draft from a fact that isn't real."
// No separate "trilingual generation" module exists to import (confirmed
// during Part 2's read-first pass — lib/chatbot/language.ts only picks
// which FIXED string to show, it doesn't control free-text generation
// language) — same system-prompt-instructs-the-language pattern as Part 2,
// reusing the same LANGUAGE_NAME map.

export interface CaptionListingFacts {
  productId: string;
  productName: string;
  description: string | null;
  basePriceRM: number | null;
  rating: number | null;
  reviewCount: number;
}

export interface CaptionResult {
  caption: string;
  mode: 'llm' | 'rule-based';
}

const CAPTION_MAX_TOKENS = 200;

/**
 * The ONLY source of truth for what a caption may say about a listing.
 * Returns null if the listing isn't real/live right now (e.g. deactivated
 * since it was suggested) — never drafts a caption for something that
 * can't actually be shared.
 */
async function getCaptionListingFacts(productId: string): Promise<CaptionListingFacts | null> {
  const service = createServiceClient();
  const [{ data: product }, { data: metric }] = await Promise.all([
    service.from('products').select('id, name, description, base_price').eq('id', productId).eq('status', 'active').eq('review_status', 'approved').maybeSingle(),
    service.from('product_review_metrics').select('rating, reviews').eq('product_id', productId).maybeSingle(),
  ]);
  if (!product) return null;

  return {
    productId: product.id,
    productName: product.name,
    description: product.description,
    basePriceRM: product.base_price !== null && product.base_price !== undefined ? Number(product.base_price) : null,
    rating: metric ? Number(metric.rating) : null,
    reviewCount: metric ? Number(metric.reviews) : 0,
  };
}

function buildCaptionSystemPrompt(lang: ChatLanguage): string {
  return `You are writing a short, ready-to-post social-media caption for an affiliate to share a real listing on MyWisata, a Malaysian tourism platform.

Below is the REAL listing's facts — the ONLY facts you may use. Never invent a feature, highlight, price, location detail, or claim not present in the data. If a field is null/missing, do not mention it at all (e.g. no rating given means no star rating in the caption).

Write ONE short caption, 1-3 sentences, casual and inviting, suitable for posting directly to WhatsApp/Instagram/Facebook. Mention the listing by its real name.

This caption is customer-facing marketing copy for the listing — never mention affiliate earnings, commissions, or imply the reader (poster) will make money from it.

All money amounts are already in Malaysian Ringgit — if you mention a price, write it as "RM45.00", never another currency symbol.

Reply in ${LANGUAGE_NAME[lang]}.

Respond with ONLY the caption text itself — no quotes, no markdown, no JSON, no commentary.`;
}

function ruleBasedCaption(facts: CaptionListingFacts): string {
  const parts = [`Check out ${facts.productName} on MyWisata!`];
  if (facts.rating !== null && facts.reviewCount > 0) parts.push(`Rated ${facts.rating.toFixed(1)}★ by ${facts.reviewCount} traveller${facts.reviewCount === 1 ? '' : 's'}.`);
  if (facts.basePriceRM !== null) parts.push(`From ${formatMYR(facts.basePriceRM)}.`);
  return parts.join(' ');
}

/**
 * Drafts a share caption for one specific, real, currently-active listing.
 * Returns null if the listing isn't real/live (nothing to draft — the
 * caller should treat this the same as "suggestion no longer available").
 * Falls back to a plain, fact-only rule-based caption (always English, no
 * translation without the LLM) if Gemini is unavailable — same "never
 * blank/broken" discipline as generateCopilotActions(). The result is
 * always a draft: the caller/UI is responsible for showing it as editable
 * and never auto-posting it anywhere.
 */
export async function draftCopilotCaption(productId: string, lang: ChatLanguage): Promise<CaptionResult | null> {
  const facts = await getCaptionListingFacts(productId);
  if (!facts) return null;

  try {
    const raw = await callGemini(buildCaptionSystemPrompt(lang), JSON.stringify(facts), { temperature: 0.5, maxOutputTokens: CAPTION_MAX_TOKENS });
    const caption = raw.trim();
    if (!caption) throw new Error('Gemini returned an empty caption');
    return { caption, mode: 'llm' };
  } catch (error) {
    console.error('[affiliate] copilot caption generation failed, using rule-based fallback', error instanceof Error ? error.message : error);
    return { caption: ruleBasedCaption(facts), mode: 'rule-based' };
  }
}
