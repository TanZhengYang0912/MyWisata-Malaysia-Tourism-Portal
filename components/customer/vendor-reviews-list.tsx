"use client";

import { useState } from "react";
import Link from "next/link";
import { useTranslation } from "react-i18next";
import { Star } from "lucide-react";
import type { ScopedReviewItem, ReviewRatingBucket } from "@/backend/domains/vendor-reviews";
import { FeedbackCollection, type FeedbackReviewItem } from "@/components/customer/feedback/feedback-collection";
import { LocalizedContent } from "@/components/customer/localized-content";
import { Button } from "@/components/ui/button";
import { formatDate } from "@/lib/i18n/format";
import { DEFAULT_LOCALE, isAppLocale } from "@/lib/i18n/locale";

export type VendorReviewItem = ScopedReviewItem;

interface VendorReviewsListProps {
  reviews: VendorReviewItem[];
  ratingBuckets: ReviewRatingBucket[];
  totalReviews: number;
  vendorId: string;
}

const PAGE_SIZE = 6;

export function VendorReviewsList({ reviews: initialReviews, ratingBuckets: initialBuckets, totalReviews: initialTotal, vendorId }: VendorReviewsListProps) {
  const { t, i18n } = useTranslation("customer");
  const locale = isAppLocale(i18n.resolvedLanguage) ? i18n.resolvedLanguage : DEFAULT_LOCALE;
  const [reviews, setReviews] = useState(initialReviews);
  const [ratingBuckets, setRatingBuckets] = useState(initialBuckets);
  const [total, setTotal] = useState(initialTotal);
  const [selectedRating, setSelectedRating] = useState<number | null>(null);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(Math.max(1, Math.ceil(initialTotal / PAGE_SIZE)));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function loadPage(nextPage: number, nextRating = selectedRating) {
    setLoading(true);
    setError(null);
    const params = new URLSearchParams({ page: String(nextPage), pageSize: String(PAGE_SIZE) });
    if (nextRating !== null) params.set("rating", String(nextRating));
    try {
      const response = await fetch(`/api/vendors/${vendorId}/reviews?${params}`, { cache: "no-store" });
      const payload = await response.json() as { data?: { items?: VendorReviewItem[]; page?: number; total?: number; totalPages?: number; ratingBuckets?: ReviewRatingBucket[] }; error?: { message?: string } };
      if (!response.ok || !payload.data) throw new Error(payload.error?.message || t("ui.reviews.loadError"));
      setReviews(payload.data.items ?? []);
      setRatingBuckets(payload.data.ratingBuckets ?? []);
      setTotal(payload.data.total ?? 0);
      setPage(payload.data.page ?? nextPage);
      setTotalPages(payload.data.totalPages ?? 1);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : t("ui.reviews.loadError"));
    } finally {
      setLoading(false);
    }
  }

  function reviewPresentation(review: VendorReviewItem): FeedbackReviewItem {
    const reviewTitle = review.title
      ? <LocalizedContent entityType="review" entityId={review.id} field="title" sourceText={review.title}>{({ text }) => text}</LocalizedContent>
      : undefined;
    const detailTitle = review.title
      ? <LocalizedContent entityType="review" entityId={review.id} field="title" sourceText={review.title} />
      : undefined;
    const preview = review.body
      ? <LocalizedContent entityType="review" entityId={review.id} field="body" sourceText={review.body}>{({ text }) => text}</LocalizedContent>
      : reviewTitle ?? t("ui.reviews.guestReview");
    const body = review.body
      ? <LocalizedContent entityType="review" entityId={review.id} field="body" sourceText={review.body} />
      : null;
    const productHref = review.productId
      ? `/customer/products/${review.productId}?source=vendor${review.outletId ? `&outletId=${encodeURIComponent(review.outletId)}` : ""}&returnTo=${encodeURIComponent(`/customer/vendors/${vendorId}`)}`
      : null;

    return {
      id: review.id,
      author: review.authorName,
      date: formatDate(review.createdAt, locale),
      title: reviewTitle,
      detailTitle,
      preview,
      content: body ?? reviewTitle ?? t("ui.reviews.guestReview"),
      rating: review.rating,
      ratingLabel: t("ui.reviews.ratingOutOfFive", { rating: review.rating.toFixed(1) }),
      verifiedLabel: t("ui.reviews.verifiedPurchase"),
      metadata: (review.productName || review.outletName) ? (
        <>
          {review.productName && <span className="rounded-md bg-secondary px-2 py-1 text-[11px] font-semibold text-primary">{review.productName}</span>}
          {review.outletName && <span className="text-[11px] text-muted-foreground">{review.outletName}</span>}
        </>
      ) : undefined,
      actions: productHref ? <Link href={productHref} className="text-xs font-semibold text-primary underline-offset-4 hover:underline">{t("ui.vendor.viewProductDetails")}</Link> : undefined,
    };
  }

  const controls = (
    <>
      <Button type="button" size="sm" variant={selectedRating === null ? "default" : "outline"} onClick={() => { setSelectedRating(null); void loadPage(1, null); }}>
        {t("ui.reviews.allRatings")} ({initialTotal})
      </Button>
      {ratingBuckets.map(({ rating, count }) => (
        <Button key={rating} type="button" size="sm" variant={selectedRating === rating ? "default" : "outline"} onClick={() => { setSelectedRating(rating); void loadPage(1, rating); }}>
          <Star size={13} aria-hidden="true" /> {t("ui.reviews.ratingBucketLabel", { rating, reviewCount: count })}
        </Button>
      ))}
    </>
  );

  return (
    <div className="space-y-4">
      {error && <p role="alert" className="rounded-xl bg-destructive/10 p-3 text-sm text-destructive">{error}</p>}
      {loading ? (
        <p role="status" className="text-sm text-muted-foreground">{t("ui.reviews.loading")}</p>
      ) : reviews.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border p-6 text-sm text-muted-foreground">{selectedRating === null ? t("ui.states.noReviews") : t("ui.reviews.noReviewsForRating")}</p>
      ) : (
        <FeedbackCollection mode="reviews" items={reviews.map(reviewPresentation)} controls={controls} />
      )}
      {!loading && totalPages > 1 && (
        <nav aria-label={t("ui.reviews.pages")} className="flex items-center justify-between border-t border-border pt-4">
          <Button type="button" size="sm" variant="outline" disabled={page <= 1} onClick={() => void loadPage(page - 1)}>{t("actions.previous", { ns: "common" })}</Button>
          <span className="text-xs text-muted-foreground">{t("ui.reviews.paginationSummary", {
            pageLabel: t("ui.reviews.pageOf", { page, total: totalPages }),
            reviewCountLabel: t("ui.reviews.count", { count: total }),
          })}</span>
          <Button type="button" size="sm" variant="outline" disabled={page >= totalPages} onClick={() => void loadPage(page + 1)}>{t("actions.next", { ns: "common" })}</Button>
        </nav>
      )}
    </div>
  );
}
