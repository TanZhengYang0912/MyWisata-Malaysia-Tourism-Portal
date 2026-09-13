"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useTranslation } from "react-i18next";
import { CheckCircle2, ChevronDown, ChevronUp, MapPin, Star, Tag } from "lucide-react";
import { formatDate } from "@/lib/i18n/format";
import { DEFAULT_LOCALE, isAppLocale } from "@/lib/i18n/locale";

export type VendorReviewItem = {
  id: string;
  rating: number;
  title?: string;
  body?: string;
  createdAt: string;
  authorName: string;
  productId?: string | null;
  productName?: string | null;
  outletId?: string | null;
  outletName?: string | null;
};

interface VendorReviewsListProps {
  reviews: VendorReviewItem[];
  vendorId: string;
  initialVisibleCount?: number;
}

export function VendorReviewsList({ reviews, vendorId, initialVisibleCount = 6 }: VendorReviewsListProps) {
  const { t, i18n } = useTranslation("customer");
  const locale = isAppLocale(i18n.resolvedLanguage) ? i18n.resolvedLanguage : DEFAULT_LOCALE;

  const [selectedRating, setSelectedRating] = useState<number | "all">("all");
  const [showAll, setShowAll] = useState(false);

  // Compute rating breakdown
  const ratingCounts = useMemo(() => {
    const counts: Record<number, number> = { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 };
    for (const r of reviews) {
      const rounded = Math.round(r.rating);
      if (counts[rounded] !== undefined) counts[rounded]++;
    }
    return counts;
  }, [reviews]);

  const filteredReviews = useMemo(() => {
    if (selectedRating === "all") return reviews;
    return reviews.filter((r) => Math.round(r.rating) === selectedRating);
  }, [reviews, selectedRating]);

  const visibleReviews = showAll ? filteredReviews : filteredReviews.slice(0, initialVisibleCount);
  const hasMore = filteredReviews.length > initialVisibleCount;

  if (reviews.length === 0) return null;

  return (
    <div className="mt-6 space-y-6">
      {/* Rating Filter Pills */}
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => {
            setSelectedRating("all");
            setShowAll(false);
          }}
          className={`rounded-full px-3.5 py-1.5 text-xs font-bold transition ${
            selectedRating === "all"
              ? "bg-primary text-white shadow-sm"
              : "border border-border bg-card text-muted-foreground hover:border-primary/40 hover:text-foreground"
          }`}
        >
          {t("ui.reviews.allRatings")} ({reviews.length})
        </button>

        {[5, 4, 3, 2, 1].map((stars) => {
          const count = ratingCounts[stars] ?? 0;
          if (count === 0) return null;
          const active = selectedRating === stars;
          return (
            <button
              key={stars}
              type="button"
              onClick={() => {
                setSelectedRating(stars);
                setShowAll(false);
              }}
              className={`inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-bold transition ${
                active
                  ? "bg-amber-500 text-white shadow-sm"
                  : "border border-border bg-card text-muted-foreground hover:border-amber-500/40 hover:text-foreground"
              }`}
            >
              <Star size={12} fill="currentColor" className={active ? "text-white" : "text-amber-500"} />
              <span>{stars}★</span>
              <span className={`text-[10px] ${active ? "text-white/80" : "text-muted-foreground"}`}>({count})</span>
            </button>
          );
        })}
      </div>

      {/* Review Cards Grid */}
      {visibleReviews.length > 0 ? (
        <div className="grid gap-4 sm:grid-cols-2">
          {visibleReviews.map((review) => {
            const productHref = review.productId
              ? `/customer/activity/${review.productId}?source=vendor${
                  review.outletId ? `&outletId=${encodeURIComponent(review.outletId)}` : ""
                }&returnTo=${encodeURIComponent(`/customer/vendor/${vendorId}`)}`
              : null;

            return (
              <article
                key={review.id}
                className="flex flex-col justify-between rounded-2xl border border-border bg-card/70 p-5 shadow-sm transition hover:border-primary/30 hover:bg-card"
              >
                <div>
                  {/* Top Bar: Rating & Date */}
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-1.5">
                      <div className="flex text-amber-500" aria-label={t("ui.reviews.ratingOutOfFive", { rating: review.rating })}>
                        {Array.from({ length: 5 }).map((_, i) => (
                          <Star
                            key={i}
                            size={14}
                            fill={i < Math.round(review.rating) ? "currentColor" : "none"}
                            className={i < Math.round(review.rating) ? "text-amber-500" : "text-muted-foreground/30"}
                          />
                        ))}
                      </div>
                      <span className="text-xs font-bold text-foreground">{review.rating.toFixed(1)}</span>
                    </div>

                    <time dateTime={review.createdAt} className="text-xs text-muted-foreground">
                      {formatDate(review.createdAt, locale)}
                    </time>
                  </div>

                  {/* Review Title */}
                  <h3 className="mt-2.5 text-sm font-bold text-foreground">
                    {review.title || t("ui.reviews.guestReview")}
                  </h3>

                  {/* Review Body */}
                  {review.body && (
                    <p className="mt-1.5 text-xs leading-5 text-muted-foreground line-clamp-4">
                      “{review.body}”
                    </p>
                  )}
                </div>

                {/* Bottom metadata */}
                <div className="mt-4 border-t border-border/60 pt-3 text-xs">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-semibold text-foreground/90">{review.authorName}</span>
                    <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-600 dark:text-emerald-400">
                      <CheckCircle2 size={12} />
                      {t("ui.reviews.verifiedPurchase")}
                    </span>
                  </div>

                  {/* Product & Outlet Badges */}
                  {(review.productName || review.outletName) && (
                    <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
                      {review.productName && (
                        productHref ? (
                          <Link
                            href={productHref}
                            className="inline-flex items-center gap-1 rounded-md bg-secondary px-2 py-1 text-[11px] font-semibold text-primary transition hover:bg-primary hover:text-white"
                          >
                            <Tag size={10} />
                            <span className="line-clamp-1 max-w-[200px]">{review.productName}</span>
                          </Link>
                        ) : (
                          <span className="inline-flex items-center gap-1 rounded-md bg-secondary px-2 py-1 text-[11px] font-semibold text-foreground/75">
                            <Tag size={10} />
                            <span className="line-clamp-1 max-w-[200px]">{review.productName}</span>
                          </span>
                        )
                      )}

                      {review.outletName && (
                        <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
                          <MapPin size={10} />
                          <span className="line-clamp-1 max-w-[180px]">{review.outletName}</span>
                        </span>
                      )}
                    </div>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      ) : (
        <div className="rounded-xl border border-dashed border-border bg-card/40 p-8 text-center text-xs text-muted-foreground">
          {t("ui.reviews.noReviewsForRating")}
        </div>
      )}

      {/* Show All / Show Less Button */}
      {hasMore && (
        <div className="text-center pt-2">
          <button
            type="button"
            onClick={() => setShowAll(!showAll)}
            className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-secondary px-5 py-2.5 text-xs font-bold text-primary transition hover:border-primary/40 hover:bg-primary hover:text-white"
          >
            {showAll ? (
              <>
                <span>{t("ui.reviews.showLess")}</span>
                <ChevronUp size={14} />
              </>
            ) : (
              <>
                <span>{t("ui.reviews.showAll", { count: filteredReviews.length })}</span>
                <ChevronDown size={14} />
              </>
            )}
          </button>
        </div>
      )}
    </div>
  );
}
