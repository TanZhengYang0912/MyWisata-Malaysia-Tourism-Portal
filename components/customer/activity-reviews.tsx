"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { ChevronLeft, ChevronRight, Star, X } from "lucide-react";
import type { ProductReview } from "@/backend/core/types";
import { DEFAULT_REVIEW_PAGE_SIZE, getReviewPageState } from "@/lib/customer/review-pagination";
import { formatDate } from "@/lib/i18n/format";
import { DEFAULT_LOCALE, isAppLocale } from "@/lib/i18n/locale";

interface Props {
  productId: string;
  /** Reviews are filtered to this outlet when set. Changing it refreshes the preview and closes any open review list. */
  outletId?: string;
  rating: number;
  totalReviews: number;
  initialReviews: ProductReview[];
}

function ReviewCard({ review }: { review: ProductReview }) {
  const { t, i18n } = useTranslation("customer");
  const locale = isAppLocale(i18n.resolvedLanguage) ? i18n.resolvedLanguage : DEFAULT_LOCALE;
  return (
    <article className="rounded-xl bg-muted/70 px-3 py-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-foreground">{review.title || t("ui.reviews.guestReview")}</p>
          <p className="mt-1 text-xs text-muted-foreground">{review.authorName} · {formatDate(review.createdAt, locale)}</p>
        </div>
        <div className="flex shrink-0 items-center gap-1" aria-label={t("ui.reviews.ratingOutOfFive", { rating: review.rating })}>
          <Star size={12} fill="var(--highlight-yellow)" stroke="none" />
          <span className="text-xs font-bold text-foreground">{review.rating}</span>
        </div>
      </div>
      {review.body && <p className="mt-2 text-sm leading-6 text-foreground/80">“{review.body}”</p>}
      {review.verifiedPurchase && <p className="mt-2 text-[11px] font-semibold text-primary">✓ {t("ui.reviews.verifiedPurchase")}</p>}
    </article>
  );
}

function reviewsQueryString(page: number, pageSize: number, outletId?: string): string {
  const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
  if (outletId) params.set("outletId", outletId);
  return params.toString();
}

export function ActivityReviews({ productId, outletId, rating, totalReviews, initialReviews }: Props) {
  const { t } = useTranslation("customer");
  const [open, setOpen] = useState(false);
  // Inline 3-review preview — kept separate from the modal's paginated list so
  // paging through the modal never leaks a stale page into the preview.
  const [preview, setPreview] = useState(initialReviews);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [reviews, setReviews] = useState<ProductReview[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const pageState = getReviewPageState(totalReviews, page, DEFAULT_REVIEW_PAGE_SIZE);
  const previousOutletId = useRef(outletId);

  // Switching outlets means the previous preview belongs to a different
  // outlet — close any open review list (it's paginating the old outlet's
  // reviews) and refetch the preview. Skipped on first mount: SSR already
  // matches the initially-selected outlet.
  useEffect(() => {
    if (previousOutletId.current === outletId) return;
    previousOutletId.current = outletId;
    setOpen(false);
    let cancelled = false;
    setPreviewLoading(true);
    fetch(`/api/products/${productId}/reviews?${reviewsQueryString(1, 3, outletId)}`, { cache: "no-store" })
      .then((response) => response.json())
      .then((payload) => { if (!cancelled && payload.data) setPreview(payload.data.items); })
      .finally(() => { if (!cancelled) setPreviewLoading(false); });
    return () => { cancelled = true; };
  }, [outletId, productId]);

  async function loadPage(nextPage: number) {
    setLoading(true);
    setError("");
    try {
      const response = await fetch(`/api/products/${productId}/reviews?${reviewsQueryString(nextPage, DEFAULT_REVIEW_PAGE_SIZE, outletId)}`, { cache: "no-store" });
      const payload = await response.json();
      if (!response.ok || !payload.data) throw new Error(payload.error?.message || t("ui.reviews.loadError"));
      setReviews(payload.data.items);
      setPage(payload.data.page);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : t("ui.reviews.loadError"));
    } finally {
      setLoading(false);
    }
  }

  function openAllReviews() {
    setOpen(true);
    void loadPage(1);
  }

  return (
    <>
      <section className="mb-6 rounded-2xl border border-border bg-card p-4 sm:p-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-primary">{t("ui.reviews.eyebrow")}</p>
          <p className="mt-1 text-sm text-muted-foreground">{t("ui.reviews.summary")}</p>
          </div>
          <div className="shrink-0 text-right">
            <div className="flex items-center justify-end gap-1.5">
              <Star size={15} fill="var(--highlight-yellow)" stroke="none" />
              <span className="text-lg font-bold text-foreground">{rating}</span>
            </div>
            <p className="text-[11px] text-muted-foreground">{t("ui.reviews.count", { count: totalReviews })}</p>
          </div>
        </div>

        {previewLoading ? (
          <p className="mt-4 rounded-xl bg-muted px-3 py-3 text-sm text-muted-foreground">{t("ui.reviews.loading")}</p>
        ) : totalReviews === 0 ? (
          <p className="mt-4 rounded-xl bg-muted px-3 py-3 text-sm text-muted-foreground">{t("ui.states.noReviews")}</p>
        ) : (
          <div className="mt-4 space-y-3">
            {preview.slice(0, 3).map((review) => <ReviewCard key={review.id} review={review} />)}
            {totalReviews > 3 && (
              <button type="button" onClick={openAllReviews} className="w-full rounded-xl border border-primary/20 px-4 py-3 text-sm font-semibold text-primary transition hover:bg-secondary">
                {t("ui.actions.viewAll")} {totalReviews}
              </button>
            )}
          </div>
        )}
      </section>

      {open && (
        <div className="fixed inset-0 z-[70] flex items-end justify-center bg-slate-950/45 p-0 sm:items-center sm:p-6" role="presentation" onClick={(event) => { if (event.target === event.currentTarget) setOpen(false); }}>
          <section className="max-h-[88vh] w-full max-w-2xl overflow-y-auto rounded-t-3xl bg-card p-5 shadow-2xl sm:rounded-3xl sm:p-6" role="dialog" aria-modal="true" aria-labelledby="all-reviews-title">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.16em] text-primary">{t("ui.reviews.guestReviews")}</p>
                <h2 id="all-reviews-title" className="mt-1 text-xl font-bold text-foreground">{t("ui.reviews.allReviews", { count: totalReviews })}</h2>
              </div>
              <button type="button" onClick={() => setOpen(false)} className="rounded-full p-2 text-muted-foreground transition hover:bg-muted hover:text-foreground" aria-label={t("ui.reviews.closeAll")}><X size={18} /></button>
            </div>

            {loading ? <p className="py-10 text-center text-sm text-muted-foreground">{t("ui.reviews.loading")}</p> : error ? <div className="mt-5 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}<button type="button" onClick={() => void loadPage(page)} className="ml-2 font-semibold underline">{t("ui.actions.retry")}</button></div> : reviews.length === 0 ? <p className="py-10 text-center text-sm text-muted-foreground">{t("ui.states.noReviews")}</p> : <div className="mt-5 space-y-3">{reviews.map((review) => <ReviewCard key={review.id} review={review} />)}</div>}

            {!loading && !error && totalReviews > 0 && (
              <nav aria-label={t("ui.reviews.pages")} className="mt-5 flex items-center justify-between border-t border-border pt-4">
                <button type="button" onClick={() => void loadPage(pageState.page - 1)} disabled={!pageState.hasPrevious} className="inline-flex items-center gap-1 rounded-xl border border-border px-3 py-2 text-xs font-semibold text-muted-foreground transition hover:border-primary/30 hover:text-primary disabled:cursor-not-allowed disabled:opacity-40"><ChevronLeft size={15} /> {t("actions.previous", { ns: "common" })}</button>
                <span className="text-xs font-semibold text-muted-foreground">{t("ui.reviews.pageOf", { page: pageState.page, total: pageState.totalPages })}</span>
                <button type="button" onClick={() => void loadPage(pageState.page + 1)} disabled={!pageState.hasNext} className="inline-flex items-center gap-1 rounded-xl border border-border px-3 py-2 text-xs font-semibold text-muted-foreground transition hover:border-primary/30 hover:text-primary disabled:cursor-not-allowed disabled:opacity-40">{t("actions.next", { ns: "common" })} <ChevronRight size={15} /></button>
              </nav>
            )}
          </section>
        </div>
      )}
    </>
  );
}
