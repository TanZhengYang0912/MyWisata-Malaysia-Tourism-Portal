"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { ChevronLeft, ChevronRight, Star, X } from "lucide-react";
import type { ProductReview } from "@/backend/core/types";
import { DEFAULT_REVIEW_PAGE_SIZE, getReviewPageState } from "@/lib/customer/review-pagination";
import { formatDate } from "@/lib/i18n/format";
import { DEFAULT_LOCALE, isAppLocale } from "@/lib/i18n/locale";
import { useCustomerCapabilityGate } from "@/components/customer/use-customer-capability-gate";
import { CUSTOMER_CAPABILITY } from "@/lib/auth/customer-capabilities";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

interface Props {
  productId: string;
  /** Reviews are filtered to this outlet when set. Changing it refreshes the preview and closes any open review list. */
  outletId?: string;
  rating: number;
  totalReviews: number;
  initialReviews: ProductReview[];
}

type ReviewViewer = {
  state: "signed_out" | "eligible" | "not_purchased" | "already_reviewed";
  canReview: boolean;
  orderItemId: string | null;
};

function ReviewCard({ review }: { review: ProductReview }) {
  const { t, i18n } = useTranslation("customer");
  const locale = isAppLocale(i18n.resolvedLanguage) ? i18n.resolvedLanguage : DEFAULT_LOCALE;
  return (
    <article className="rounded-xl bg-muted/70 px-3 py-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="break-words whitespace-normal text-sm font-semibold text-foreground">{review.title || t("ui.reviews.guestReview")}</p>
          <p className="mt-1 break-words whitespace-normal text-xs text-muted-foreground">{review.authorName} · {formatDate(review.createdAt, locale)}</p>
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
  const gate = useCustomerCapabilityGate();
  const [open, setOpen] = useState(false);
  const [preview, setPreview] = useState(initialReviews);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [summaryRating, setSummaryRating] = useState(rating);
  const [summaryTotal, setSummaryTotal] = useState(totalReviews);
  const [viewer, setViewer] = useState<ReviewViewer | null>(null);
  const [reviewFormOpen, setReviewFormOpen] = useState(false);
  const [reviewRating, setReviewRating] = useState(0);
  const [reviewTitle, setReviewTitle] = useState("");
  const [reviewBody, setReviewBody] = useState("");
  const [reviewSubmitting, setReviewSubmitting] = useState(false);
  const [reviewMessage, setReviewMessage] = useState("");
  const [reviewError, setReviewError] = useState("");
  const [page, setPage] = useState(1);
  const [reviews, setReviews] = useState<ProductReview[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const pageState = getReviewPageState(summaryTotal, page, DEFAULT_REVIEW_PAGE_SIZE);
  const previousOutletId = useRef(outletId);

  async function refreshPreview() {
    const response = await fetch(`/api/products/${productId}/reviews?${reviewsQueryString(1, 3, outletId)}`, { cache: "no-store" });
    const payload = await response.json();
    if (!response.ok || !payload.data) throw new Error(payload.error?.message || t("ui.reviews.loadError"));
    setPreview(payload.data.items);
    setSummaryTotal(payload.data.total);
    setViewer(payload.data.viewer ?? null);
  }

  // The SSR preview remains visible while this request also loads the viewer's
  // purchase/review eligibility.
  useEffect(() => {
    const changedOutlet = previousOutletId.current !== outletId;
    previousOutletId.current = outletId;
    if (changedOutlet) {
      setOpen(false);
      setReviewFormOpen(false);
      setReviewMessage("");
      setReviewError("");
      setSummaryRating(rating);
      setPreviewLoading(true);
    }
    let cancelled = false;
    void fetch(`/api/products/${productId}/reviews?${reviewsQueryString(1, 3, outletId)}`, { cache: "no-store" })
      .then(async (response) => {
        const payload = await response.json();
        if (!response.ok || !payload.data) throw new Error(payload.error?.message || t("ui.reviews.loadError"));
        if (!cancelled) {
          setPreview(payload.data.items);
          setSummaryTotal(payload.data.total);
          setViewer(payload.data.viewer ?? null);
        }
      })
      .catch(() => undefined)
      .finally(() => { if (!cancelled && changedOutlet) setPreviewLoading(false); });
    return () => { cancelled = true; };
  }, [outletId, productId, rating, t]);

  async function loadPage(nextPage: number) {
    setLoading(true);
    setError("");
    try {
      const response = await fetch(`/api/products/${productId}/reviews?${reviewsQueryString(nextPage, DEFAULT_REVIEW_PAGE_SIZE, outletId)}`, { cache: "no-store" });
      const payload = await response.json();
      if (!response.ok || !payload.data) throw new Error(payload.error?.message || t("ui.reviews.loadError"));
      setReviews(payload.data.items);
      setPage(payload.data.page);
      setSummaryTotal(payload.data.total);
      setViewer(payload.data.viewer ?? null);
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

  function openReviewForm() {
    if (!gate(CUSTOMER_CAPABILITY.ACCOUNT_MUTATION)) return;
    setReviewMessage("");
    setReviewError("");
    if (viewer?.canReview && viewer.orderItemId) {
      setReviewFormOpen(true);
      return;
    }
    if (viewer?.state === "already_reviewed") setReviewMessage(t("ui.reviews.alreadyReviewed"));
    else if (viewer?.state === "not_purchased") setReviewMessage(t("ui.reviews.notPurchased"));
    else setReviewMessage(t("ui.reviews.reviewStatusLoading"));
  }

  async function submitReview(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!viewer?.canReview || !viewer.orderItemId) return;
    if (!reviewRating) {
      setReviewError(t("ui.reviews.reviewRequired"));
      return;
    }
    setReviewSubmitting(true);
    setReviewError("");
    try {
      const response = await fetch(`/api/products/${productId}/reviews`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          orderItemId: viewer.orderItemId,
          rating: reviewRating,
          ...(reviewTitle.trim() ? { title: reviewTitle.trim() } : {}),
          ...(reviewBody.trim() ? { body: reviewBody.trim() } : {}),
        }),
      });
      const payload = await response.json();
      if (!response.ok) {
        const code = payload.error?.code;
        if (code === "ALREADY_REVIEWED") throw new Error(t("ui.reviews.alreadyReviewed"));
        if (code === "NOT_ELIGIBLE") throw new Error(t("ui.reviews.notPurchased"));
        throw new Error(t("ui.reviews.submitError"));
      }
      const nextTotal = summaryTotal + 1;
      setSummaryTotal(nextTotal);
      setSummaryRating(Math.round(((summaryRating * summaryTotal) + reviewRating) / nextTotal * 10) / 10);
      setViewer({ state: "already_reviewed", canReview: false, orderItemId: null });
      setReviewFormOpen(false);
      setReviewRating(0);
      setReviewTitle("");
      setReviewBody("");
      setReviewMessage(t("ui.reviews.submitted"));
      await refreshPreview();
    } catch (reason) {
      setReviewError(reason instanceof Error ? reason.message : t("ui.reviews.submitError"));
    } finally {
      setReviewSubmitting(false);
    }
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
              <span className="text-lg font-bold text-foreground">{summaryRating}</span>
            </div>
            <p className="text-[11px] text-muted-foreground">{t("ui.reviews.count", { count: summaryTotal })}</p>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <Button type="button" variant="outline" onClick={openReviewForm}>{t("ui.reviews.writeReview")}</Button>
          {reviewMessage && <p className="text-sm text-muted-foreground" role="status">{reviewMessage}</p>}
        </div>

        {reviewFormOpen && (
          <form onSubmit={submitReview} className="mt-4 rounded-xl border border-primary/20 bg-secondary/40 p-4" aria-label={t("ui.reviews.shareExperience")}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="font-semibold text-foreground">{t("ui.reviews.shareExperience")}</h3>
                <p className="mt-1 text-xs text-muted-foreground">{t("ui.reviews.rateActivity")}</p>
              </div>
              <button type="button" onClick={() => setReviewFormOpen(false)} className="rounded-full p-1 text-muted-foreground hover:bg-muted hover:text-foreground" aria-label={t("ui.reviews.cancel")}><X size={16} /></button>
            </div>
            <div className="mt-3 flex items-center gap-1" role="group" aria-label={t("ui.reviews.rateActivity")}>
              {[1, 2, 3, 4, 5].map((value) => (
                <button key={value} type="button" onClick={() => setReviewRating(value)} aria-label={t("ui.reviews.selectRating", { rating: value })} aria-pressed={reviewRating === value} className="rounded-md p-1 transition hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
                  <Star size={24} fill={value <= reviewRating ? "var(--highlight-yellow)" : "none"} className={value <= reviewRating ? "text-[var(--highlight-yellow)]" : "text-muted-foreground"} />
                </button>
              ))}
            </div>
            <div className="mt-3 space-y-3">
              <Input value={reviewTitle} onChange={(event) => setReviewTitle(event.target.value)} maxLength={255} placeholder={t("ui.reviews.reviewTitlePlaceholder")} aria-label={t("ui.reviews.reviewTitle")} />
              <Textarea value={reviewBody} onChange={(event) => setReviewBody(event.target.value)} maxLength={600} rows={4} placeholder={t("ui.reviews.reviewBodyPlaceholder")} aria-label={t("ui.reviews.reviewBody")} />
            </div>
            {reviewError && <p className="mt-3 text-sm text-red-700" role="alert">{reviewError}</p>}
            <div className="mt-4 flex justify-end gap-2">
              <Button type="button" variant="ghost" onClick={() => setReviewFormOpen(false)}>{t("ui.reviews.cancel")}</Button>
              <Button type="submit" disabled={reviewSubmitting}>{reviewSubmitting ? t("ui.reviews.submitting") : t("ui.reviews.submit")}</Button>
            </div>
          </form>
        )}

        {previewLoading ? (
          <p className="mt-4 rounded-xl bg-muted px-3 py-3 text-sm text-muted-foreground">{t("ui.reviews.loading")}</p>
        ) : summaryTotal === 0 ? (
          <p className="mt-4 rounded-xl bg-muted px-3 py-3 text-sm text-muted-foreground">{t("ui.states.noReviews")}</p>
        ) : (
          <div className="mt-4 space-y-3">
            {preview.slice(0, 3).map((review) => <ReviewCard key={review.id} review={review} />)}
            {summaryTotal > 3 && (
              <button type="button" onClick={openAllReviews} className="w-full rounded-xl border border-primary/20 px-4 py-3 text-sm font-semibold text-primary transition hover:bg-secondary">
                {t("ui.actions.viewAll")} {summaryTotal}
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
                <h2 id="all-reviews-title" className="mt-1 text-xl font-bold text-foreground">{t("ui.reviews.allReviews", { count: summaryTotal })}</h2>
              </div>
              <button type="button" onClick={() => setOpen(false)} className="rounded-full p-2 text-muted-foreground transition hover:bg-muted hover:text-foreground" aria-label={t("ui.reviews.closeAll")}><X size={18} /></button>
            </div>

            {loading ? <p className="py-10 text-center text-sm text-muted-foreground">{t("ui.reviews.loading")}</p> : error ? <div className="mt-5 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}<button type="button" onClick={() => void loadPage(page)} className="ml-2 font-semibold underline">{t("ui.actions.retry")}</button></div> : reviews.length === 0 ? <p className="py-10 text-center text-sm text-muted-foreground">{t("ui.states.noReviews")}</p> : <div className="mt-5 space-y-3">{reviews.map((review) => <ReviewCard key={review.id} review={review} />)}</div>}

            {!loading && !error && summaryTotal > 0 && (
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
