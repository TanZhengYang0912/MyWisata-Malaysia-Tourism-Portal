// P4 — Member 4: AI Budget Guard — Part 1 (evaluation only, no LLM yet).
//
// Same discipline as lib/customer/trip-copilot.ts and lib/affiliate/copilot.ts:
// every number here comes from a real query (getComputedActivity, then the
// same catalogue search the trip planner already uses) — nothing invented.
// A later LLM phrasing layer may only describe this real, already-computed
// result, never compute or guess a price/saving itself.
//
// Deliberately takes a plain BudgetItem[] rather than reading a cart or trip
// itself — the caller (a cart-checking API route today; a trip-checking one
// later, once that backend is real) resolves its own items and hands them
// in. This function never trusts a caller-supplied price: resolveBudgetItems()
// re-fetches every price/category/state from the real product record.

import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { getComputedActivity, searchActivities } from '@/backend/domains/catalogue';
import { canonicalCategorySlug } from '@/lib/customer/discovery-categories';
import { callGemini } from '@/lib/admin-ai/gemini';
import { formatMYR } from '@/lib/i18n/format';
import type { ChatLanguage } from '@/lib/chatbot/language';

export interface BudgetItem {
  productId: string;
  name: string;
  /** RM, real unit price from the product record — never a client-supplied number. */
  price: number;
  qty: number;
  category: string;
  categorySlug?: string;
  state: string | null;
  /**
   * products.product_type ('product'|'activity'|'experience'|'food'|'digital')
   * — a real DB column, finer than categorySlug's 4 discovery buckets. Needed
   * because the catalogue files food-tour EXPERIENCES (e.g. "Jalan Alor
   * Street Food Crawl") and food-tasting ITEMS (e.g. a tour's "Chicken Rice
   * Set" course) both under categorySlug='activity' — categorySlug alone let
   * a landmark admission's "alternatives" include a food-themed listing.
   * Not exposed by ComputedActivity, so read directly here.
   */
  productType: string;
}

export interface BudgetAlternative {
  productId: string;
  name: string;
  price: number;
  rating: number;
  reviews: number;
  /** This item's unit price minus the alternative's — always > 0 (a non-cheaper result is never returned as an "alternative"). */
  savingsRM: number;
  /** Real coordinate — the listing's own place, else its representative outlet's. Lets the UI show it on the map, never invented. */
  lat: number;
  lng: number;
  image: string | null;
}

export interface OverBudgetItem {
  productId: string;
  name: string;
  price: number;
  qty: number;
  lineTotalRM: number;
  /** Real, active, cheaper same-category/state listings. Capped. Empty is a valid, honest result — never padded. */
  alternatives: BudgetAlternative[];
}

export interface BudgetGuardResult {
  totalRM: number;
  budgetRM: number;
  isOverBudget: boolean;
  overBudgetByRM: number;
  /** The priciest line items driving the overage, ranked, each with real cheaper alternatives. Empty when not over budget. */
  overBudgetItems: OverBudgetItem[];
}

const MAX_ITEMS_TO_ADDRESS = 3;
const MAX_ALTERNATIVES_PER_ITEM = 3;

async function fetchProductTypes(productIds: string[], db: SupabaseClient): Promise<Map<string, string>> {
  if (productIds.length === 0) return new Map();
  const { data, error } = await db.from('products').select('id,product_type').in('id', productIds);
  if (error) throw error;
  return new Map((data ?? []).map((row) => [row.id as string, row.product_type as string]));
}

/**
 * Resolves {productId, qty} lines (e.g. straight from a cart or trip) into
 * real BudgetItems — price/category/state always come from the live product
 * record, never from the caller. A line whose product is gone/inactive is
 * dropped rather than guessed at.
 */
export async function resolveBudgetItems(
  lines: { productId: string; qty: number }[],
  db: SupabaseClient,
): Promise<BudgetItem[]> {
  const resolved = await Promise.all(lines.map(async (line) => {
    const activity = await getComputedActivity(line.productId, undefined, db);
    return activity ? { line, activity } : null;
  }));
  const pairs = resolved.filter((pair): pair is NonNullable<typeof pair> => pair !== null);
  const productTypeById = await fetchProductTypes(pairs.map(({ activity }) => activity.id), db);

  return pairs.map(({ line, activity }) => ({
    productId: activity.id,
    name: activity.name,
    price: activity.price,
    qty: line.qty,
    category: activity.category,
    categorySlug: activity.categorySlug,
    state: activity.place?.state ?? activity.outlet.state ?? null,
    productType: productTypeById.get(activity.id) ?? 'activity',
  }));
}

async function findCheaperAlternatives(
  item: BudgetItem,
  excludeProductIds: Set<string>,
  db: SupabaseClient,
): Promise<BudgetAlternative[]> {
  const results = await searchActivities({
    state: item.state,
    categorySlug: canonicalCategorySlug(item.categorySlug),
    priceMax: item.price,
    sort: 'rating_desc',
  }, db);
  const candidates = results.filter((activity) => !excludeProductIds.has(activity.id) && activity.price < item.price);

  // categorySlug alone is too coarse — the catalogue puts food-tour
  // experiences and food-tasting items in the same discovery category as
  // landmark admissions (see BudgetItem.productType's comment). Requiring
  // the real product_type to match too keeps a landmark's alternatives to
  // other landmarks/experiences of the same type, never a food item.
  const productTypeById = await fetchProductTypes(candidates.map((activity) => activity.id), db);

  return candidates
    .filter((activity) => productTypeById.get(activity.id) === item.productType)
    .slice(0, MAX_ALTERNATIVES_PER_ITEM)
    .map((activity) => ({
      productId: activity.id,
      name: activity.name,
      price: activity.price,
      rating: activity.rating,
      reviews: activity.reviews,
      savingsRM: Math.round((item.price - activity.price) * 100) / 100,
      lat: activity.place?.lat ?? activity.outlet.lat,
      lng: activity.place?.lng ?? activity.outlet.lng,
      image: activity.image,
    }));
}

export async function evaluateBudget(
  items: BudgetItem[],
  budgetRM: number,
  db: SupabaseClient,
): Promise<BudgetGuardResult> {
  const totalRM = Math.round(items.reduce((sum, item) => sum + item.price * item.qty, 0) * 100) / 100;
  const overBudgetByRM = Math.max(0, Math.round((totalRM - budgetRM) * 100) / 100);
  const isOverBudget = overBudgetByRM > 0;

  if (!isOverBudget) {
    return { totalRM, budgetRM, isOverBudget, overBudgetByRM: 0, overBudgetItems: [] };
  }

  const ranked = [...items]
    .sort((a, b) => (b.price * b.qty) - (a.price * a.qty))
    .slice(0, MAX_ITEMS_TO_ADDRESS);
  const excludeProductIds = new Set(items.map((item) => item.productId));

  const overBudgetItems = await Promise.all(ranked.map(async (item) => ({
    productId: item.productId,
    name: item.name,
    price: item.price,
    qty: item.qty,
    lineTotalRM: Math.round(item.price * item.qty * 100) / 100,
    alternatives: await findCheaperAlternatives(item, excludeProductIds, db),
  })));

  return { totalRM, budgetRM, isOverBudget, overBudgetByRM, overBudgetItems };
}

// ─── Part 2: message generation ─────────────────────────────────────────────
// Same hallucination-guard-by-construction discipline as
// lib/affiliate/copilot.ts / lib/customer/trip-copilot.ts: the LLM only
// picks among and phrases the real (original item, alternative) pairings
// already computed by evaluateBudget() — every returned pairing is
// independently re-checked against that real data after the fact, and
// anything that isn't a real match is silently dropped. Falls back to a
// deterministic rule-based message if Gemini is unavailable, returns invalid
// JSON, or nothing survives validation.

export interface BudgetGuardMessage {
  originalProductId: string;
  originalName: string;
  alternativeProductId: string;
  alternativeName: string;
  savingsRM: number;
  message: string;
  /** The alternative's own real coordinate/image — carried straight through from BudgetAlternative, never re-derived or invented. */
  alternativeLat: number;
  alternativeLng: number;
  alternativeImage: string | null;
}

export interface BudgetGuardMessagesResult {
  messages: BudgetGuardMessage[];
  mode: 'llm' | 'rule-based' | 'within-budget';
}

const MAX_MESSAGES = MAX_ITEMS_TO_ADDRESS;

// en/bm/zh mirrors lib/chatbot/language.ts's ChatLanguage — real multilingual
// generation is system-prompt-driven, not a translation module. Same pattern
// as lib/affiliate/copilot.ts and lib/customer/trip-copilot.ts.
const LANGUAGE_NAME: Record<ChatLanguage, string> = {
  en: 'English',
  bm: 'Bahasa Melayu',
  zh: 'Simplified Chinese',
};

const messageSchema = z.object({
  originalProductId: z.string(),
  alternativeProductId: z.string(),
  message: z.string().min(1),
}).strict();
const llmResponseSchema = z.object({ messages: z.array(messageSchema) }).strict();

function extractJson(text: string): unknown {
  const stripped = text.replace(/```json\s*|```/g, '').trim();
  return JSON.parse(stripped);
}

function buildBudgetGuardSystemPrompt(lang: ChatLanguage): string {
  return `You are a budget assistant for a Malaysian tourism platform, MyWisata, helping a traveller who has gone over their own stated budget for a set of picked items.

Below is the REAL computed budget situation (already computed — treat every number, item, and alternative as fact, never invent or change one). Each over-budget item comes with its own list of real, genuinely cheaper alternatives already found in the catalogue.

Write up to ${MAX_MESSAGES} short, friendly swap suggestions. Each one must pair ONE over-budget item with ONE of its own real alternatives — originalProductId and alternativeProductId MUST come from the SAME pairing already present in the data. Never pair an alternative with a different original item, and never invent either id. If an item's alternatives list is empty, skip it entirely — do not invent an alternative for it.

Mention the real savings amount in each message. NEVER blame the traveller or use guilt-inducing language ("you overspent") — frame it as a helpful, neutral option ("swapping X for Y saves RM12").

All money amounts are already in Malaysian Ringgit — write a price as "RM12.50", never "$12.50" or another currency symbol.

Reply in ${LANGUAGE_NAME[lang]}, for every message field.

Respond with ONLY strict JSON, no markdown, no commentary, in this exact shape:
{"messages": [{"originalProductId": "<the over-budget item's id>", "alternativeProductId": "<one of ITS OWN alternatives' id>", "message": "<swap suggestion, in the target language>"}]}`;
}

function validateMessages(raw: z.infer<typeof messageSchema>[], result: BudgetGuardResult): BudgetGuardMessage[] {
  const pairs = new Map<string, { originalName: string; alternativeName: string; savingsRM: number; lat: number; lng: number; image: string | null }>();
  for (const item of result.overBudgetItems) {
    for (const alt of item.alternatives) {
      pairs.set(`${item.productId}::${alt.productId}`, { originalName: item.name, alternativeName: alt.name, savingsRM: alt.savingsRM, lat: alt.lat, lng: alt.lng, image: alt.image });
    }
  }

  const validated: BudgetGuardMessage[] = [];
  for (const item of raw) {
    const pair = pairs.get(`${item.originalProductId}::${item.alternativeProductId}`);
    if (!pair) continue;
    validated.push({
      originalProductId: item.originalProductId,
      originalName: pair.originalName,
      alternativeProductId: item.alternativeProductId,
      alternativeName: pair.alternativeName,
      savingsRM: pair.savingsRM,
      message: item.message,
      alternativeLat: pair.lat,
      alternativeLng: pair.lng,
      alternativeImage: pair.image,
    });
  }
  return validated.slice(0, MAX_MESSAGES);
}

/**
 * Deterministic fallback — always English (no translation without the LLM),
 * the biggest real saving per over-budget item, same discipline as
 * lib/affiliate/copilot.ts::ruleBasedCopilotActions().
 */
export function ruleBasedBudgetGuardMessages(result: BudgetGuardResult): BudgetGuardMessage[] {
  const messages: BudgetGuardMessage[] = [];
  for (const item of result.overBudgetItems) {
    const best = [...item.alternatives].sort((a, b) => b.savingsRM - a.savingsRM)[0];
    if (!best) continue;
    messages.push({
      originalProductId: item.productId,
      originalName: item.name,
      alternativeProductId: best.productId,
      alternativeName: best.name,
      savingsRM: best.savingsRM,
      message: `Swap "${item.name}" for "${best.name}" to save ${formatMYR(best.savingsRM)}.`,
      alternativeLat: best.lat,
      alternativeLng: best.lng,
      alternativeImage: best.image,
    });
    if (messages.length >= MAX_MESSAGES) break;
  }
  return messages;
}

export async function generateBudgetGuardMessages(result: BudgetGuardResult, lang: ChatLanguage): Promise<BudgetGuardMessagesResult> {
  if (!result.isOverBudget) {
    return { messages: [], mode: 'within-budget' };
  }
  // Over budget but genuinely nothing cheaper found anywhere — an honest
  // empty result, never worth a Gemini call.
  if (!result.overBudgetItems.some((item) => item.alternatives.length > 0)) {
    return { messages: [], mode: 'rule-based' };
  }

  try {
    const raw = await callGemini(buildBudgetGuardSystemPrompt(lang), JSON.stringify(result), { temperature: 0.5, maxOutputTokens: 500 });
    const parsed = llmResponseSchema.parse(extractJson(raw));
    const messages = validateMessages(parsed.messages, result);
    if (messages.length === 0) throw new Error('No messages survived grounding validation');
    return { messages, mode: 'llm' };
  } catch (error) {
    console.error('[budget-guard] message generation failed, using rule-based fallback', error instanceof Error ? error.message : error);
    return { messages: ruleBasedBudgetGuardMessages(result), mode: 'rule-based' };
  }
}
