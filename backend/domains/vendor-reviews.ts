import type { SupabaseClient } from "@supabase/supabase-js";
import type { ProductReview } from "@/backend/core/types";
import { getPublicReviewAuthorNames } from "@/backend/domains/catalogue";
import { toProductReview } from "@/backend/domains/review-presenter";

export type ReviewScopeType = "vendor" | "outlet" | "product" | "product_outlet" | "outlet_accommodation";

export interface ReviewRatingBucket {
  rating: number;
  count: number;
}

export interface ReviewRatingSummary {
  rating: number;
  total: number;
  buckets: ReviewRatingBucket[];
}

export interface ScopedReviewItem extends ProductReview {
  productId: string | null;
  productName: string | null;
  outletId: string | null;
  outletName: string | null;
}

export interface ScopedReviewPage {
  items: ScopedReviewItem[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export interface ScopedReviewPageOptions {
  page?: number;
  pageSize?: number;
  rating?: number;
  productCategorySlug?: string;
}

type MetricRow = { rating: number | string; review_count: number | string };

function roundOneDecimal(value: number): number {
  return Math.round(value * 10) / 10;
}

export async function getReviewRatingSummary(
  scopeType: ReviewScopeType,
  scopeId: string,
  db: SupabaseClient,
  contextScopeId?: string,
): Promise<ReviewRatingSummary> {
  let query = db
    .from("review_rating_metrics_by_scope")
    .select("rating,review_count")
    .eq("scope_type", scopeType)
    .eq("scope_id", scopeId);
  if (contextScopeId) query = query.eq("context_scope_id", contextScopeId);
  const { data, error } = await query;
  if (error) throw error;
  return summarizeRatingRows((data ?? []) as unknown as MetricRow[]);
}

function summarizeRatingRows(rows: MetricRow[]): ReviewRatingSummary {
  const buckets = rows
    .map((row) => ({ rating: Number(row.rating), count: Number(row.review_count) }))
    .filter((bucket) => Number.isInteger(bucket.rating) && bucket.rating >= 1 && bucket.rating <= 5 && bucket.count > 0)
    .sort((first, second) => second.rating - first.rating);
  const total = buckets.reduce((sum, bucket) => sum + bucket.count, 0);
  const weightedRating = buckets.reduce((sum, bucket) => sum + bucket.rating * bucket.count, 0);

  return { rating: total ? roundOneDecimal(weightedRating / total) : 0, total, buckets };
}

/** Ratings for many vendors, outlets or products of one scope in one query; ids without reviews are left out. */
export async function getScopeRatingSummaries(scopeType: "vendor" | "outlet" | "product", ids: string[], db: SupabaseClient): Promise<Map<string, { value: number; count: number }>> {
  const summaries = new Map<string, { value: number; count: number }>();
  if (ids.length === 0) return summaries;
  const { data, error } = await db
    .from("review_rating_metrics_by_scope")
    .select("scope_id,rating,review_count")
    .eq("scope_type", scopeType)
    .in("scope_id", ids);
  if (error) throw error;
  const rowsById = new Map<string, MetricRow[]>();
  for (const row of (data ?? []) as unknown as Array<MetricRow & { scope_id: string }>) {
    rowsById.set(row.scope_id, [...(rowsById.get(row.scope_id) ?? []), row]);
  }
  for (const [id, rows] of rowsById) {
    const summary = summarizeRatingRows(rows);
    if (summary.total > 0) summaries.set(id, { value: summary.rating, count: summary.total });
  }
  return summaries;
}

/** Vendor-scope ratings for many vendors in one query; vendors without reviews are left out. */
export function getVendorRatingSummaries(vendorIds: string[], db: SupabaseClient) {
  return getScopeRatingSummaries("vendor", vendorIds, db);
}

function firstRelation<T>(value: T | T[] | null | undefined): T | null {
  return Array.isArray(value) ? value[0] ?? null : value ?? null;
}

export async function getScopedReviewPage(
  scopeType: ReviewScopeType,
  scopeId: string,
  options: ScopedReviewPageOptions,
  db: SupabaseClient,
): Promise<ScopedReviewPage> {
  const scopeColumn = `${scopeType}_id`;
  const requestedPageSize = Math.floor(Number(options.pageSize ?? 6));
  const pageSize = Math.min(10, Math.max(1, Number.isFinite(requestedPageSize) ? requestedPageSize : 6));
  const requestedPage = Math.max(1, Math.floor(Number(options.page ?? 1)) || 1);
  const rating = options.rating;

  let countQuery = db
    .from("reviews")
    .select(options.productCategorySlug ? "id,products!inner(categories!inner(slug))" : "id", { count: "exact", head: true })
    .eq(scopeColumn, scopeId)
    .eq("is_visible", true);
  if (rating !== undefined) countQuery = countQuery.eq("rating", rating);
  if (options.productCategorySlug) countQuery = countQuery.eq("products.categories.slug", options.productCategorySlug);
  const { count, error: countError } = await countQuery;
  if (countError) throw countError;

  const total = count ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const page = Math.min(requestedPage, totalPages);
  const offset = (page - 1) * pageSize;

  let dataQuery = db
    .from("reviews")
    .select(options.productCategorySlug
      ? "id,rating,title,body,created_at,user_id,product_id,outlet_id,products!inner(name,categories!inner(slug)),outlets(name)"
      : "id,rating,title,body,created_at,user_id,product_id,outlet_id,products(name),outlets(name)")
    .eq(scopeColumn, scopeId)
    .eq("is_visible", true);
  if (rating !== undefined) dataQuery = dataQuery.eq("rating", rating);
  if (options.productCategorySlug) dataQuery = dataQuery.eq("products.categories.slug", options.productCategorySlug);
  const { data, error } = await dataQuery
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .range(offset, offset + pageSize - 1);
  if (error) throw error;

  const rows = (data ?? []) as unknown as Array<{
    id: string;
    rating: number;
    title: string | null;
    body: string | null;
    created_at: string;
    user_id: string | null;
    product_id: string | null;
    outlet_id: string | null;
    products: { name: string | null } | { name: string | null }[] | null;
    outlets: { name: string | null } | { name: string | null }[] | null;
  }>;
  const authorNames = await getPublicReviewAuthorNames(db, rows.map((row) => row.user_id ?? ""));

  return {
    items: rows.map((row) => {
      const product = firstRelation(row.products);
      const outlet = firstRelation(row.outlets);
      return {
        ...toProductReview({
          id: row.id,
          rating: row.rating,
          title: row.title,
          body: row.body,
          created_at: row.created_at,
          users: { full_name: row.user_id ? authorNames.get(row.user_id) ?? null : null },
        }),
        productId: row.product_id,
        productName: product?.name ?? null,
        outletId: row.outlet_id,
        outletName: outlet?.name ?? null,
      };
    }),
    page,
    pageSize,
    total,
    totalPages,
  };
}
