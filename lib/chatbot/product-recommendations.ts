import { z } from 'zod';
import type { RealCategorySlug } from '@/lib/customer/discovery-categories';
import { canonicalCategorySlug, REAL_CATEGORY_SLUGS } from '@/lib/customer/discovery-categories';
import { STATES_MY } from '@/lib/customer/malaysia-states';

export interface RecommendationActivity {
  id: string;
  name: string;
  category: string;
  categorySlug?: string;
  description?: string;
  image?: string | null;
  price: number;
  rating: number;
  reviews: number;
  requiresBooking?: boolean;
  isFamilyFriendly?: boolean;
  place?: { state?: string | null } | null;
  outlet: { city: string; state: string };
}

export interface RecommendationProductSnapshot {
  id: string;
  name: string;
  category: RealCategorySlug;
  price: number;
  rating: number;
  reviews: number;
  city: string;
  state: string;
}

export type ProductRecommendationData =
  | { kind: 'clarification'; question: 'category'; options: RealCategorySlug[] }
  | {
    kind: 'no-results';
    category: RealCategorySlug;
    state: string | null;
    priceMax: number | null;
    familyFriendlyOnly: boolean;
    options: ('any-state' | 'remove-budget')[];
  }
  | { kind: 'results'; products: RecommendationProductSnapshot[] }
  | { kind: 'unavailable' };

export interface ParsedRecommendationFilters {
  category: RealCategorySlug | null;
  state: string | null;
  familyFriendlyOnly: boolean;
  priceMax: number | null;
}

const RECOMMENDATION_INTENT = /推荐|推介|推荐几个|介绍几个|帮我找|找几个|推荐一下|有什么.{0,8}(?:商品|产品|活动|景点|美食|住宿)|recommend|suggest|find me|show me|cadangkan|syorkan|carikan|nak cari/i;
const FAMILY_TERMS = /小孩|孩子|儿童|亲子|家庭|family|kid(?:s)?|children|child-friendly|family-friendly|untuk keluarga|kanak-kanak/i;

const CATEGORY_ALIASES: Record<RealCategorySlug, RegExp> = {
  food: /美食|食物|餐厅|餐飲|吃的|food|restaurant|dining|makanan|makan/i,
  activity: /活动|活動|景点|景點|体验|體驗|冒险|冒險|activity|activities|attraction|experience|adventure|aktiviti|tarikan/i,
  accommodation: /住宿|酒店|旅馆|旅館|民宿|accommodation|hotel|stay|penginapan/i,
  retail: /购物|購物|商店|零售|纪念品|紀念品|retail|shopping|shop|souvenir|kedai/i,
};

const STATE_ALIASES: Record<string, string[]> = {
  Johor: ['柔佛'], Kedah: ['吉打'], Kelantan: ['吉兰丹'], Melaka: ['Malacca', '马六甲', '馬六甲'],
  'Negeri Sembilan': ['森美兰', '森美蘭'], Pahang: ['彭亨'], Perak: ['霹雳', '霹靂'], Perlis: ['玻璃市'],
  Penang: ['Pulau Pinang', '槟城', '檳城'], Sabah: ['沙巴'], Sarawak: ['砂拉越'], Selangor: ['雪兰莪', '雪蘭莪'],
  Terengganu: ['登嘉楼', '登嘉樓'], 'Kuala Lumpur': ['KL', '吉隆坡'], Putrajaya: ['布城'], Labuan: ['纳闽', '納閩'],
};

function categoryFromText(text: string): RealCategorySlug | null {
  return REAL_CATEGORY_SLUGS.find((category) => CATEGORY_ALIASES[category].test(text)) ?? null;
}

function stateFromText(text: string): string | null {
  if (/全马来西亚|全馬來西亞|不限地区|不限地區|anywhere|any state|all malaysia|seluruh malaysia/i.test(text)) return null;
  return STATES_MY.find((state) => state !== 'All Malaysia' && [state, ...(STATE_ALIASES[state] ?? [])].some((alias) => {
    const escaped = alias.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return /[\u3400-\u9fff]/u.test(alias)
      ? text.includes(alias)
      : new RegExp(`(?:^|[^\\p{L}])${escaped}(?=$|[^\\p{L}])`, 'iu').test(text);
  })) ?? null;
}

function priceFromText(text: string): number | null {
  if (/不限预算|不限預算|不限制预算|不限制預算|no budget limit|any budget|tiada had bajet|tanpa had bajet/i.test(text)) return null;
  const match = text.match(/(?:rm|myr)\s*(\d{1,5}(?:\.\d{1,2})?)|(?:under|below|less than|以内|以下|预算|預算|不超过|不超過)\s*(?:rm|myr)?\s*(\d{1,5}(?:\.\d{1,2})?)/i);
  const amount = Number(match?.[1] ?? match?.[2]);
  return Number.isFinite(amount) && amount >= 0 && amount <= 10000 ? amount : null;
}

export function parseProductRecommendationIntent(text: string): ParsedRecommendationFilters | null {
  if (!RECOMMENDATION_INTENT.test(text)) return null;
  return {
    category: categoryFromText(text),
    state: stateFromText(text),
    familyFriendlyOnly: FAMILY_TERMS.test(text),
    priceMax: priceFromText(text),
  };
}

export function combineProductRecommendationFollowUp(question: string, followUp: string): string {
  const previous = question.trim();
  const answer = followUp.trim();
  if (!previous) return answer.slice(0, 500);
  if (!answer) return previous.slice(0, 500);
  if (previous.length + answer.length + 1 <= 500) return `${previous} ${answer}`;
  const boundedAnswer = answer.slice(-499);
  return `${previous.slice(0, 499 - boundedAnswer.length).trimEnd()} ${boundedAnswer}`.trim();
}

const PRODUCT_CANDIDATE_LIMIT = 12;
const DISPLAY_LIMIT = 3;

function activityState(activity: RecommendationActivity): string {
  return activity.place?.state || activity.outlet.state || '';
}

function categoryMatches(activity: RecommendationActivity, category: RealCategorySlug): boolean {
  return canonicalCategorySlug(activity.categorySlug) === category;
}

function toSnapshot(activity: RecommendationActivity): RecommendationProductSnapshot | null {
  const category = canonicalCategorySlug(activity.categorySlug);
  if (!category || !Number.isFinite(activity.price) || activity.price < 0) return null;
  return {
    id: activity.id,
    name: activity.name.slice(0, 160),
    category,
    price: activity.price,
    rating: Number.isFinite(activity.rating) ? Math.max(0, Math.min(5, activity.rating)) : 0,
    reviews: Number.isFinite(activity.reviews) ? Math.max(0, Math.floor(activity.reviews)) : 0,
    city: (activity.outlet.city || '').slice(0, 100),
    state: activityState(activity).slice(0, 100),
  };
}

export function getProductRecommendationCandidates(
  filters: ParsedRecommendationFilters,
  activities: RecommendationActivity[],
  query = '',
): RecommendationProductSnapshot[] {
  if (!filters.category) return [];
  const stateNames = Object.values(STATE_ALIASES).flat().concat(STATES_MY).map((value) => value.toLocaleLowerCase());
  const stopWords = new Set([
    'the', 'and', 'for', 'with', 'from', 'under', 'below', 'less', 'than', 'recommend', 'suggest', 'find', 'show', 'me', 'some', 'few', 'product', 'products', 'family', 'families', 'kids', 'kid', 'children', 'child', 'friendly', 'activity', 'activities', 'attraction', 'food', 'restaurant', 'accommodation', 'hotel', 'shopping', 'retail', 'rm', 'myr',
    '推荐', '推薦', '几个', '幾個', '一些', '适合', '適合', '小孩', '孩子', '儿童', '兒童', '亲子', '親子', '家庭', '活动', '活動', '景点', '景點', '美食', '商品', '产品', '產品', '住宿', '酒店', '购物', '購物', '帮我', '幫我', '找几个', '找幾個',
  ]);
  const terms = new Set((query.match(/\p{Script=Han}{2,}|[\p{L}]{3,}/gu) ?? []).flatMap((token) => {
    const normalized = token.toLocaleLowerCase();
    if (stopWords.has(normalized) || stateNames.includes(normalized)) return [];
    if (/^\p{Script=Han}+$/u.test(token)) {
      return Array.from({ length: Math.max(0, token.length - 1) }, (_, index) => token.slice(index, index + 2))
        .filter((part) => !stopWords.has(part));
    }
    return [normalized];
  }));
  const relevance = (activity: RecommendationActivity) => {
    if (terms.size === 0) return 0;
    const name = activity.name.toLocaleLowerCase();
    const description = (activity.description ?? '').toLocaleLowerCase();
    return [...terms].reduce((score, term) => score + (name.includes(term) ? 3 : 0) + (description.includes(term) ? 1 : 0), 0);
  };
  return [...activities]
    .filter((activity) => (
      categoryMatches(activity, filters.category!)
      && (!filters.state || activityState(activity).toLocaleLowerCase() === filters.state.toLocaleLowerCase())
      && (!filters.familyFriendlyOnly || activity.isFamilyFriendly === true)
      && (filters.priceMax === null || activity.price <= filters.priceMax)
    ))
    .sort((a, b) => (
      relevance(b) - relevance(a)
      || b.rating * Math.log2(b.reviews + 1) - a.rating * Math.log2(a.reviews + 1)
      || a.price - b.price
      || a.id.localeCompare(b.id)
    ))
    .slice(0, PRODUCT_CANDIDATE_LIMIT)
    .flatMap((activity) => {
      const snapshot = toSnapshot(activity);
      return snapshot ? [snapshot] : [];
    });
}

export function buildProductRecommendation(text: string, activities: RecommendationActivity[]): ProductRecommendationData | null {
  const filters = parseProductRecommendationIntent(text);
  if (!filters) return null;
  if (!filters.category) {
    return { kind: 'clarification', question: 'category', options: [...REAL_CATEGORY_SLUGS] };
  }

  const ranked = getProductRecommendationCandidates(filters, activities, text);

  if (ranked.length === 0) {
    return {
      kind: 'no-results',
      category: filters.category,
      state: filters.state,
      priceMax: filters.priceMax,
      familyFriendlyOnly: filters.familyFriendlyOnly,
      options: [...(filters.state ? ['any-state' as const] : []), ...(filters.priceMax !== null ? ['remove-budget' as const] : [])],
    };
  }

  return {
    kind: 'results',
    products: ranked.slice(0, DISPLAY_LIMIT),
  };
}

const selectionSchema = z.object({
  suggestions: z.array(z.object({ productId: z.string().min(1).max(80) }).strict()).max(DISPLAY_LIMIT),
}).strict();

export function validateProductRecommendationSelection(
  value: unknown,
  candidates: readonly { id: string }[],
): string[] {
  const parsed = selectionSchema.safeParse(value);
  if (!parsed.success) return [];
  const allowed = new Set(candidates.map((candidate) => candidate.id));
  const seen = new Set<string>();
  return parsed.data.suggestions.flatMap((suggestion) => {
    if (!allowed.has(suggestion.productId) || seen.has(suggestion.productId)) return [];
    seen.add(suggestion.productId);
    return [suggestion.productId];
  });
}

export function applyProductRecommendationSelection(
  data: ProductRecommendationData,
  selections: readonly string[],
  candidatePool: readonly RecommendationProductSnapshot[] = data.kind === 'results' ? data.products : [],
): ProductRecommendationData {
  if (data.kind !== 'results' || selections.length === 0) return data;
  const byId = new Map(candidatePool.map((product) => [product.id, product]));
  return {
    ...data,
    products: [...selections.flatMap((id) => byId.has(id) ? [byId.get(id)!] : []), ...data.products.filter((product) => !selections.includes(product.id))].slice(0, DISPLAY_LIMIT),
  };
}

export function parseProductRecommendationSelection(text: string, candidates: readonly { id: string }[]): string[] {
  try {
    const json = text.replace(/```json\s*|```/gi, '').trim();
    return validateProductRecommendationSelection(JSON.parse(json) as unknown, candidates);
  } catch {
    return [];
  }
}
