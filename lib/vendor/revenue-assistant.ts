// P4 — Member 4: AI Vendor Revenue Assistant. CLAUDE-VENDOR-REVENUE-ASSISTANT.md.
//
// Part 1: deterministic listing-quality check (pure code, no LLM — see Part 0's
// investigation report). Part 2: occupancy/promo-timing signal. Part 3:
// ratings/refund-quality signal. Part 4: prescriptive generation — the model
// phrases/prioritizes these three real signals, never invents one; every
// action is cross-checked against the real signal it cites. Part 0 found
// FAQ-abandonment not honestly buildable (no product linkage on chatbot
// messages, no cart/checkout-abandonment tracking) — cut entirely, no
// substitute, per the spec's own instruction.
//
// Same discipline as the other two copilots: every number here comes from a
// real query, nothing invented. Deterministic detection (this file) is never
// delegated to the LLM — a later generation layer only phrases/prioritizes
// what's already computed here.
//
// Vendor-scope resolution is a small, deliberate duplication of
// lib/vendor/analytics.ts::getVendorAnalyticsData()'s owner-or-outlet-manager
// resolution block, not an extraction into a shared helper — the spec's own
// guardrail is "keep the diff minimal, a new card not a restructure," and
// touching that file's existing working logic risks a regression in code
// this module doesn't own.

import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';
import { callGemini } from '@/lib/admin-ai/gemini';
import type { ChatLanguage } from '@/lib/chatbot/language';

export interface VendorScope {
  vendorId: string;
  vendorName: string;
  /** Product ids this vendor scope covers — already outlet-scoped for an outlet manager. */
  productIds: string[];
}

/**
 * Resolves the current user to their vendor + product scope — owner sees
 * every listing, an outlet manager sees only their assigned outlets'
 * listings. Mirrors lib/vendor/analytics.ts::getVendorAnalyticsData()'s
 * resolution exactly. Returns null if the user isn't a vendor owner or
 * outlet manager of an approved vendor.
 */
export async function resolveVendorScope(authDb: SupabaseClient, userId: string): Promise<VendorScope | null> {
  const { data: ownedVendors, error: vendorError } = await authDb.from('vendors').select('id,name,status').eq('owner_id', userId).eq('status', 'approved').limit(1);
  if (vendorError) throw vendorError;
  let vendor = ownedVendors?.[0];
  let scopedOutletIds: string[] | null = null;

  if (!vendor) {
    const { data: assignments, error: assignmentError } = await authDb.from('outlet_managers').select('outlet_id,outlets(vendor_id)').eq('user_id', userId);
    if (assignmentError) throw assignmentError;
    const rows = assignments || [];
    const vendorIds = [...new Set(rows.map((row: { outlets: { vendor_id: string } | { vendor_id: string }[] }) => Array.isArray(row.outlets) ? row.outlets[0]?.vendor_id : row.outlets?.vendor_id).filter(Boolean))];
    const managerVendorId = vendorIds[0];
    if (managerVendorId) {
      const { data: managerVendors, error: managerVendorError } = await authDb.from('vendors').select('id,name,status').eq('id', managerVendorId).eq('status', 'approved').limit(1);
      if (managerVendorError) throw managerVendorError;
      vendor = managerVendors?.[0];
      scopedOutletIds = rows.filter((row: { outlet_id?: string; outlets: { vendor_id: string } | { vendor_id: string }[] }) => {
        const related = Array.isArray(row.outlets) ? row.outlets[0] : row.outlets;
        return related?.vendor_id === managerVendorId && row.outlet_id;
      }).map((row: { outlet_id: string }) => row.outlet_id);
    }
  }
  if (!vendor) return null;

  const service = createServiceClient();
  let productQuery = service.from('products').select('id,outlet_id').eq('vendor_id', vendor.id).eq('status', 'active');
  if (scopedOutletIds) productQuery = productQuery.in('outlet_id', scopedOutletIds);
  const { data: products, error: productError } = await productQuery;
  if (productError) throw productError;

  return { vendorId: vendor.id, vendorName: vendor.name, productIds: (products ?? []).map((p) => p.id) };
}

/** Resolves the current signed-in user's vendor scope, or null if not a vendor. */
export async function resolveVendorScopeForCurrentUser(): Promise<VendorScope | null> {
  const authDb = await createClient();
  const { data: { user } } = await authDb.auth.getUser();
  if (!user) return null;
  return resolveVendorScope(authDb, user.id);
}

// ─── Part 1: deterministic listing-quality check ────────────────────────────
// A factual check, not an LLM judgment call — "is cover_url null" is a
// database fact, not a matter of interpretation. MIN_DESCRIPTION_LENGTH is a
// deliberately generous floor (not "is this description good," just "is
// there meaningfully more than a placeholder here").

const MIN_DESCRIPTION_LENGTH = 40;

export type ListingQualityIssueKind = 'missing_photo' | 'missing_description' | 'no_available_slots';

export interface ListingQualityIssue {
  productId: string;
  productName: string;
  issues: ListingQualityIssueKind[];
}

export interface ListingQualitySummary {
  totalListings: number;
  /** Only listings with at least one real issue — a clean listing is simply absent, not padded with an empty issues array. */
  flagged: ListingQualityIssue[];
}

export async function checkListingQuality(scope: VendorScope, db: SupabaseClient): Promise<ListingQualitySummary> {
  if (scope.productIds.length === 0) {
    return { totalListings: 0, flagged: [] };
  }

  const { data: products, error: productError } = await db
    .from('products')
    .select('id,name,cover_url,description,requires_booking')
    .in('id', scope.productIds);
  if (productError) throw productError;

  const bookingRequiredIds = (products ?? []).filter((p) => p.requires_booking).map((p) => p.id);
  const withFutureSlots = new Set<string>();
  if (bookingRequiredIds.length > 0) {
    // Paginated — a single unlimited select silently truncates at PostgREST's
    // 1000-row default page, which would misreport listings as slot-less
    // purely due to truncation (caught live in Part 0's investigation).
    let from = 0;
    const pageSize = 1000;
    for (;;) {
      const { data: page, error: slotError } = await db
        .from('booking_slots')
        .select('product_id')
        .in('product_id', bookingRequiredIds)
        .eq('status', 'available')
        .gte('starts_at', new Date().toISOString())
        .range(from, from + pageSize - 1);
      if (slotError) throw slotError;
      for (const row of page ?? []) withFutureSlots.add(row.product_id);
      if (!page || page.length < pageSize) break;
      from += pageSize;
    }
  }

  const flagged: ListingQualityIssue[] = [];
  for (const product of products ?? []) {
    const issues: ListingQualityIssueKind[] = [];
    if (!product.cover_url) issues.push('missing_photo');
    if (!product.description || product.description.trim().length < MIN_DESCRIPTION_LENGTH) issues.push('missing_description');
    if (product.requires_booking && !withFutureSlots.has(product.id)) issues.push('no_available_slots');
    if (issues.length > 0) flagged.push({ productId: product.id, productName: product.name, issues });
  }

  return { totalListings: (products ?? []).length, flagged };
}

// ─── Part 2: occupancy & promo-timing signal ────────────────────────────────
// Only PAST slots (starts_at < now) are used — a future slot's current fill
// level isn't a settled outcome yet (it can still book up before it starts),
// so including it would produce a misleading "underbooked" claim about a
// date that hasn't happened. Bucketed by weekday only (Asia/Kuala_Lumpur
// local time) — Part 0's live data check found real per-vendor slot volume
// too thin (tens of slots, not hundreds) to support a finer weekday+time-of-
// day grid honestly; most such buckets would sit below the noise floor.

const OCCUPANCY_LOOKBACK_DAYS = 365;
const MIN_SLOTS_FOR_WEEKDAY_SIGNAL = 3;
const UNDERBOOKED_THRESHOLD = 0.2;
const WELLBOOKED_THRESHOLD = 0.8;
const UNDERBOOKED_CAP = 4;
const WELLBOOKED_CAP = 2;

const WEEKDAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

function malaysiaWeekday(date: Date): number {
  const short = new Intl.DateTimeFormat('en-US', { weekday: 'short', timeZone: 'Asia/Kuala_Lumpur' }).format(date);
  return WEEKDAY_NAMES.findIndex((name) => name.startsWith(short));
}

export interface OccupancyWeekdaySignal {
  productId: string;
  productName: string;
  weekday: number;
  weekdayName: string;
  slotCount: number;
  totalCapacity: number;
  totalBooked: number;
  /** totalBooked / totalCapacity, 0..1. */
  occupancyRate: number;
}

export interface VendorOccupancySignal {
  /** Real weekday patterns with meaningfully low occupancy, worst-first. Capped. Empty is a valid, honest result when there isn't enough past slot volume to say anything. */
  underbooked: OccupancyWeekdaySignal[];
  /** Real weekday patterns with meaningfully high occupancy — a "this is working, consider more capacity" signal. Capped. */
  wellBooked: OccupancyWeekdaySignal[];
}

export async function computeOccupancySignal(scope: VendorScope, db: SupabaseClient): Promise<VendorOccupancySignal> {
  if (scope.productIds.length === 0) {
    return { underbooked: [], wellBooked: [] };
  }

  const { data: bookingProducts, error: productError } = await db
    .from('products')
    .select('id,name')
    .in('id', scope.productIds)
    .eq('requires_booking', true);
  if (productError) throw productError;
  if (!bookingProducts || bookingProducts.length === 0) {
    return { underbooked: [], wellBooked: [] };
  }
  const nameById = new Map(bookingProducts.map((p) => [p.id, p.name as string]));
  const bookingProductIds = bookingProducts.map((p) => p.id);

  const now = new Date();
  const lookbackStart = new Date(now.getTime() - OCCUPANCY_LOOKBACK_DAYS * 86_400_000);

  const slots: { product_id: string; starts_at: string; capacity: number; booked: number }[] = [];
  let from = 0;
  const pageSize = 1000;
  for (;;) {
    const { data: page, error: slotError } = await db
      .from('booking_slots')
      .select('product_id,starts_at,capacity,booked')
      .in('product_id', bookingProductIds)
      .neq('status', 'cancelled')
      .lt('starts_at', now.toISOString())
      .gte('starts_at', lookbackStart.toISOString())
      .range(from, from + pageSize - 1);
    if (slotError) throw slotError;
    slots.push(...(page ?? []));
    if (!page || page.length < pageSize) break;
    from += pageSize;
  }

  const buckets = new Map<string, { productId: string; weekday: number; slotCount: number; totalCapacity: number; totalBooked: number }>();
  for (const slot of slots) {
    const weekday = malaysiaWeekday(new Date(slot.starts_at));
    const key = `${slot.product_id}::${weekday}`;
    const entry = buckets.get(key) ?? { productId: slot.product_id, weekday, slotCount: 0, totalCapacity: 0, totalBooked: 0 };
    entry.slotCount += 1;
    entry.totalCapacity += slot.capacity;
    entry.totalBooked += slot.booked;
    buckets.set(key, entry);
  }

  const signals: OccupancyWeekdaySignal[] = [...buckets.values()]
    .filter((bucket) => bucket.slotCount >= MIN_SLOTS_FOR_WEEKDAY_SIGNAL && bucket.totalCapacity > 0)
    .map((bucket) => ({
      productId: bucket.productId,
      productName: nameById.get(bucket.productId) ?? 'Listing',
      weekday: bucket.weekday,
      weekdayName: WEEKDAY_NAMES[bucket.weekday],
      slotCount: bucket.slotCount,
      totalCapacity: bucket.totalCapacity,
      totalBooked: bucket.totalBooked,
      occupancyRate: Math.round((bucket.totalBooked / bucket.totalCapacity) * 1000) / 1000,
    }));

  const underbooked = signals
    .filter((s) => s.occupancyRate < UNDERBOOKED_THRESHOLD)
    .sort((a, b) => a.occupancyRate - b.occupancyRate)
    .slice(0, UNDERBOOKED_CAP);
  const wellBooked = signals
    .filter((s) => s.occupancyRate >= WELLBOOKED_THRESHOLD)
    .sort((a, b) => b.occupancyRate - a.occupancyRate)
    .slice(0, WELLBOOKED_CAP);

  return { underbooked, wellBooked };
}

// ─── Part 3: ratings & refund-quality signal ────────────────────────────────

export interface ListingRating {
  productId: string;
  productName: string;
  rating: number;
  reviewCount: number;
}

// Same "meaningful volume" floor as lib/affiliate/copilot.ts's fallback
// opportunity signal — a single review isn't a quality signal either way.
const MIN_REVIEWS_FOR_RATING_SIGNAL = 3;
const LOW_RATING_THRESHOLD = 3.5;
const LOW_RATED_CAP = 3;

export interface VendorRatingSignal {
  /** Every listing with enough real review volume to be meaningful — raw context, not itself a flag. */
  all: ListingRating[];
  /** Real, meaningfully-reviewed listings below the quality bar — worst first. Capped. */
  lowRated: ListingRating[];
}

export async function getRatingSignal(scope: VendorScope, db: SupabaseClient): Promise<VendorRatingSignal> {
  if (scope.productIds.length === 0) {
    return { all: [], lowRated: [] };
  }

  const { data: metrics, error: metricsError } = await db
    .from('product_review_metrics')
    .select('product_id,rating,reviews')
    .in('product_id', scope.productIds)
    .gte('reviews', MIN_REVIEWS_FOR_RATING_SIGNAL);
  if (metricsError) throw metricsError;
  if (!metrics || metrics.length === 0) {
    return { all: [], lowRated: [] };
  }

  const { data: products, error: productError } = await db.from('products').select('id,name').in('id', metrics.map((m) => m.product_id));
  if (productError) throw productError;
  const nameById = new Map((products ?? []).map((p) => [p.id, p.name as string]));

  const all: ListingRating[] = metrics
    .filter((m) => nameById.has(m.product_id))
    .map((m) => ({ productId: m.product_id, productName: nameById.get(m.product_id)!, rating: Number(m.rating), reviewCount: Number(m.reviews) }));

  const lowRated = all
    .filter((r) => r.rating < LOW_RATING_THRESHOLD)
    .sort((a, b) => a.rating - b.rating)
    .slice(0, LOW_RATED_CAP);

  return { all, lowRated };
}

// Same reason-blind pattern-vs-noise floor as lib/affiliate/copilot.ts's
// findRefundRiskListings() — a real pattern (>= this many reversed orders,
// AND >= this share of the listing's resolved orders), never a single
// incident, and never claiming to know WHY (see CLAUDE-VENDOR-REVENUE-
// ASSISTANT.md Part 0's investigation: refunds.reason exists but isn't read
// here, same honest gap as the affiliate copilot).
const MIN_REVERSED_FOR_VENDOR_REFUND_SIGNAL = 2;
const MIN_REFUND_RATE_FOR_VENDOR_SIGNAL = 0.3;
const VENDOR_REFUND_RISK_CAP = 3;
const REVERSIBLE_ORDER_STATUSES = new Set(['cancelled', 'refunded']);
const SETTLED_ORDER_STATUSES = new Set(['paid', 'completed', 'cancelled', 'refunded']);

export interface VendorRefundRiskListing {
  productId: string;
  productName: string;
  reversedCount: number;
  settledCount: number;
  /** reversedCount / settledCount, 0..1. */
  refundRate: number;
}

export async function findVendorRefundRisk(scope: VendorScope, db: SupabaseClient): Promise<VendorRefundRiskListing[]> {
  if (scope.productIds.length === 0) return [];

  const { data: items, error: itemsError } = await db
    .from('order_items')
    .select('product_id,product_name,orders!inner(status)')
    .in('product_id', scope.productIds);
  if (itemsError) throw itemsError;

  const byProduct = new Map<string, { productName: string; reversed: number; settled: number }>();
  for (const item of (items ?? []) as Array<{ product_id: string; product_name: string; orders: { status: string } | { status: string }[] }>) {
    const status = Array.isArray(item.orders) ? item.orders[0]?.status : item.orders?.status;
    if (!status || !SETTLED_ORDER_STATUSES.has(status)) continue;
    const entry = byProduct.get(item.product_id) ?? { productName: item.product_name, reversed: 0, settled: 0 };
    entry.settled += 1;
    if (REVERSIBLE_ORDER_STATUSES.has(status)) entry.reversed += 1;
    byProduct.set(item.product_id, entry);
  }

  return [...byProduct.entries()]
    .map(([productId, entry]) => ({ productId, productName: entry.productName, reversedCount: entry.reversed, settledCount: entry.settled, refundRate: entry.settled > 0 ? entry.reversed / entry.settled : 0 }))
    .filter((r) => r.reversedCount >= MIN_REVERSED_FOR_VENDOR_REFUND_SIGNAL && r.refundRate >= MIN_REFUND_RATE_FOR_VENDOR_SIGNAL)
    .sort((a, b) => b.refundRate - a.refundRate || b.reversedCount - a.reversedCount)
    .slice(0, VENDOR_REFUND_RISK_CAP)
    .map((r) => ({ ...r, refundRate: Math.round(r.refundRate * 1000) / 1000 }));
}

// ─── Signal bundle ───────────────────────────────────────────────────────────

export interface VendorRevenueSignals {
  vendorId: string;
  vendorName: string;
  listingQuality: ListingQualitySummary;
  occupancy: VendorOccupancySignal;
  ratings: VendorRatingSignal;
  refundRisk: VendorRefundRiskListing[];
}

export async function getVendorRevenueSignals(scope: VendorScope, db: SupabaseClient): Promise<VendorRevenueSignals> {
  const [listingQuality, occupancy, ratings, refundRisk] = await Promise.all([
    checkListingQuality(scope, db),
    computeOccupancySignal(scope, db),
    getRatingSignal(scope, db),
    findVendorRefundRisk(scope, db),
  ]);
  return { vendorId: scope.vendorId, vendorName: scope.vendorName, listingQuality, occupancy, ratings, refundRisk };
}

function hasAnyVendorSignal(signals: VendorRevenueSignals): boolean {
  return signals.listingQuality.flagged.length > 0
    || signals.occupancy.underbooked.length > 0
    || signals.occupancy.wellBooked.length > 0
    || signals.ratings.lowRated.length > 0
    || signals.refundRisk.length > 0;
}

// ─── Part 4: prescriptive generation ─────────────────────────────────────────
// The model phrases/prioritizes; it never computes or invents a number,
// listing, or weekday. Every action the model returns is cross-checked
// against the real signal it claims to cite (validateVendorActions()) before
// being shown — a hallucinated reference is dropped, never surfaced. No
// "general"/unscoped category exists here (unlike the other two copilots) —
// the spec defines exactly three grounded categories, and if nothing real
// was flagged in Parts 1-3 there's nothing honest to say, so generation is
// skipped entirely (mode: 'no-data') rather than padded with commentary.

const LANGUAGE_NAME: Record<ChatLanguage, string> = {
  en: 'English',
  bm: 'Bahasa Melayu',
  zh: 'Simplified Chinese',
};

export type VendorRevenueActionKind = 'incomplete_listing' | 'promo_timing' | 'quality_attention';

export interface VendorRevenueAction {
  kind: VendorRevenueActionKind;
  message: string;
  /** Always a real id, validated against the signals. */
  productId?: string;
  productName?: string;
}

export interface VendorRevenueActionsResult {
  actions: VendorRevenueAction[];
  mode: 'llm' | 'rule-based' | 'no-data';
}

const MAX_VENDOR_ACTIONS = 4;

const vendorActionSchema = z.object({
  kind: z.enum(['incomplete_listing', 'promo_timing', 'quality_attention']),
  message: z.string().min(1),
  productId: z.string().optional(),
}).strict();
const vendorLlmResponseSchema = z.object({ actions: z.array(vendorActionSchema) }).strict();

function extractJson(text: string): unknown {
  const stripped = text.replace(/```json\s*|```/g, '').trim();
  return JSON.parse(stripped);
}

function buildVendorRevenueSystemPrompt(lang: ChatLanguage): string {
  return `You are an assistant helping a vendor on a Malaysian tourism platform, MyWisata, improve their listings' operational performance.

Below is REAL, already-computed data about their own listings (already queried — treat every listing, number, and weekday as fact, never invent or change one).

Suggest up to ${MAX_VENDOR_ACTIONS} concrete, prioritized actions as a JSON object. Ground every suggestion strictly in the data provided:
- "incomplete_listing" suggestions: the productId MUST be one of the ids in "listingQuality.flagged" — say what's actually missing for that real listing, from its own "issues" array (missing_photo, missing_description, no_available_slots).
- "promo_timing" suggestions: the productId MUST be one of the ids appearing in "occupancy.underbooked" or "occupancy.wellBooked" — a genuinely underbooked weekday is worth a promotion or rescheduling that capacity; a genuinely well-booked weekday is worth considering more capacity. Reference the real weekday and occupancy rate given, never a different one.
- "quality_attention" suggestions: the productId MUST be one of the ids in "ratings.lowRated" or "refundRisk" — a real low average rating or a real pattern of cancelled/refunded orders for that listing, worth a look. NEVER guess or state WHY a rating is low or an order was cancelled/refunded beyond what the data shows — phrase it as a neutral observation, never blame.

NEVER promise or guarantee a revenue/booking outcome ("this will increase your bookings by 20%") — frame everything as an observation or something worth considering, never a guaranteed result. NEVER invent a listing, number, weekday, or fact that is not in the data below. If the data is too thin to support a point, omit it rather than guess — fewer than ${MAX_VENDOR_ACTIONS} honest actions is correct, never pad with invented ones. If you state a count, rate, or percentage in a message, copy it EXACTLY from the matching field already computed in the data (e.g. reversedCount, settledCount, occupancyRate) — never recompute, round differently, or restate it from memory. When in doubt, describe the finding qualitatively instead of restating a number.

Reply in ${LANGUAGE_NAME[lang]}, for every message field.

Respond with ONLY strict JSON, no markdown, no commentary, in this exact shape:
{"actions": [{"kind": "incomplete_listing" | "promo_timing" | "quality_attention", "message": "<suggestion, in the target language>", "productId": "<a real id from the matching list above>"}]}`;
}

function validateVendorActions(raw: z.infer<typeof vendorActionSchema>[], signals: VendorRevenueSignals): VendorRevenueAction[] {
  const incompleteNames = new Map(signals.listingQuality.flagged.map((f) => [f.productId, f.productName]));
  const promoTimingNames = new Map([...signals.occupancy.underbooked, ...signals.occupancy.wellBooked].map((s) => [s.productId, s.productName]));
  const qualityNames = new Map([
    ...signals.ratings.lowRated.map((r) => [r.productId, r.productName] as const),
    ...signals.refundRisk.map((r) => [r.productId, r.productName] as const),
  ]);

  const validated: VendorRevenueAction[] = [];
  for (const action of raw) {
    if (action.kind === 'incomplete_listing') {
      if (!action.productId || !incompleteNames.has(action.productId)) continue;
      validated.push({ kind: action.kind, message: action.message, productId: action.productId, productName: incompleteNames.get(action.productId) });
    } else if (action.kind === 'promo_timing') {
      if (!action.productId || !promoTimingNames.has(action.productId)) continue;
      validated.push({ kind: action.kind, message: action.message, productId: action.productId, productName: promoTimingNames.get(action.productId) });
    } else if (action.kind === 'quality_attention') {
      if (!action.productId || !qualityNames.has(action.productId)) continue;
      validated.push({ kind: action.kind, message: action.message, productId: action.productId, productName: qualityNames.get(action.productId) });
    }
  }
  return validated.slice(0, MAX_VENDOR_ACTIONS);
}

const ISSUE_LABEL: Record<ListingQualityIssueKind, string> = {
  missing_photo: 'a photo',
  missing_description: 'a fuller description',
  no_available_slots: 'available booking slots',
};

/**
 * Deterministic fallback — same discipline as the other two copilots: the
 * assistant must never be blank/broken just because Gemini is unavailable.
 * Always English (no translation without the LLM), up to MAX_VENDOR_ACTIONS
 * real, grounded actions straight from the signals.
 */
export function ruleBasedVendorRevenueActions(signals: VendorRevenueSignals): VendorRevenueAction[] {
  const actions: VendorRevenueAction[] = [];

  const topIncomplete = signals.listingQuality.flagged[0];
  if (topIncomplete) {
    const issueText = topIncomplete.issues.map((issue) => ISSUE_LABEL[issue]).join(', ');
    actions.push({ kind: 'incomplete_listing', message: `"${topIncomplete.productName}" is missing ${issueText} — worth completing the listing.`, productId: topIncomplete.productId, productName: topIncomplete.productName });
  }

  const topUnderbooked = signals.occupancy.underbooked[0];
  if (topUnderbooked) {
    actions.push({ kind: 'promo_timing', message: `"${topUnderbooked.productName}"'s ${topUnderbooked.weekdayName} slots are only ${Math.round(topUnderbooked.occupancyRate * 100)}% booked — consider a promotion or rescheduling that capacity.`, productId: topUnderbooked.productId, productName: topUnderbooked.productName });
  } else {
    const topWellBooked = signals.occupancy.wellBooked[0];
    if (topWellBooked) {
      actions.push({ kind: 'promo_timing', message: `"${topWellBooked.productName}"'s ${topWellBooked.weekdayName} slots are ${Math.round(topWellBooked.occupancyRate * 100)}% booked — worth considering more capacity on that day.`, productId: topWellBooked.productId, productName: topWellBooked.productName });
    }
  }

  const topLowRated = signals.ratings.lowRated[0];
  if (topLowRated) {
    actions.push({ kind: 'quality_attention', message: `"${topLowRated.productName}" has a ${topLowRated.rating}★ average across ${topLowRated.reviewCount} reviews — worth a look.`, productId: topLowRated.productId, productName: topLowRated.productName });
  }

  const topRefundRisk = signals.refundRisk[0];
  if (topRefundRisk && actions.length < MAX_VENDOR_ACTIONS) {
    actions.push({ kind: 'quality_attention', message: `"${topRefundRisk.productName}" has had ${topRefundRisk.reversedCount} of its last ${topRefundRisk.settledCount} orders cancelled or refunded — worth checking the listing matches what's delivered.`, productId: topRefundRisk.productId, productName: topRefundRisk.productName });
  }

  return actions.slice(0, MAX_VENDOR_ACTIONS);
}

export async function generateVendorRevenueActions(signals: VendorRevenueSignals, lang: ChatLanguage): Promise<VendorRevenueActionsResult> {
  if (!hasAnyVendorSignal(signals)) {
    return { actions: [], mode: 'no-data' };
  }

  try {
    const raw = await callGemini(buildVendorRevenueSystemPrompt(lang), JSON.stringify(signals), { temperature: 0.5, maxOutputTokens: 500 });
    const parsed = vendorLlmResponseSchema.parse(extractJson(raw));
    const actions = validateVendorActions(parsed.actions, signals);
    if (actions.length === 0) throw new Error('No actions survived grounding validation');
    return { actions, mode: 'llm' };
  } catch (error) {
    console.error('[vendor-revenue] action generation failed, using rule-based fallback', error instanceof Error ? error.message : error);
    return { actions: ruleBasedVendorRevenueActions(signals), mode: 'rule-based' };
  }
}
