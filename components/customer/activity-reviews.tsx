"use client";

import { useState } from "react";
import { ChevronLeft, ChevronRight, Star, X } from "lucide-react";
import type { ProductReview } from "@/backend/core/types";
import { DEFAULT_REVIEW_PAGE_SIZE, getReviewPageState } from "@/lib/customer/review-pagination";

interface Props {
  productId: string;
  rating: number;
  totalReviews: number;
  initialReviews: ProductReview[];
}

function ReviewCard({ review }: { review: ProductReview }) {
  return (
    <article className="rounded-xl bg-muted/70 px-3 py-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-foreground">{review.title || "Guest review"}</p>
          <p className="mt-1 text-xs text-muted-foreground">{review.authorName} · {new Date(review.createdAt).toLocaleDateString("en-MY", { month: "short", day: "numeric", year: "numeric" })}</p>
        </div>
        <div className="flex shrink-0 items-center gap-1" aria-label={`${review.rating} out of 5 stars`}>
          <Star size={12} fill="var(--highlight-yellow)" stroke="none" />
          <span className="text-xs font-bold text-foreground">{review.rating}</span>
        </div>
      </div>
      {review.body && <p className="mt-2 text-sm leading-6 text-foreground/80">“{review.body}”</p>}
      {review.verifiedPurchase && <p className="mt-2 text-[11px] font-semibold text-primary">✓ Verified purchase</p>}
    </article>
  );
}

export function ActivityReviews({ productId, rating, totalReviews, initialReviews }: Props) {
  const [open, setOpen] = useState(false);
  const [page, setPage] = useState(1);
  const [reviews, setReviews] = useState(initialReviews);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const pageState = getReviewPageState(totalReviews, page, DEFAULT_REVIEW_PAGE_SIZE);

  async function loadPage(nextPage: number) {
    setLoading(true);
    setError("");
    try {
      const response = await fetch(`/api/products/${productId}/reviews?page=${nextPage}&pageSize=${DEFAULT_REVIEW_PAGE_SIZE}`, { cache: "no-store" });
      const payload = await response.json();
      if (!response.ok || !payload.data) throw new Error(payload.error?.message || "Could not load reviews");
      setReviews(payload.data.items);
      setPage(payload.data.page);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not load reviews");
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
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-primary">What guests say</p>
            <p className="mt-1 text-sm text-muted-foreground">Real feedback from completed purchases.</p>
          </div>
          <div className="shrink-0 text-right">
            <div className="flex items-center justify-end gap-1.5">
              <Star size={15} fill="var(--highlight-yellow)" stroke="none" />
              <span className="text-lg font-bold text-foreground">{rating}</span>
            </div>
            <p className="text-[11px] text-muted-foreground">{totalReviews} reviews</p>
          </div>
        </div>

        {initialReviews.length === 0 ? (
          <p className="mt-4 rounded-xl bg-muted px-3 py-3 text-sm text-muted-foreground">No reviews yet.</p>
        ) : (
          <div className="mt-4 space-y-3">
            {initialReviews.slice(0, 3).map((review) => <ReviewCard key={review.id} review={review} />)}
            {totalReviews > 3 && (
              <button type="button" onClick={openAllReviews} className="w-full rounded-xl border border-primary/20 px-4 py-3 text-sm font-semibold text-primary transition hover:bg-secondary">
                View all {totalReviews} reviews
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
                <p className="text-xs font-bold uppercase tracking-[0.16em] text-primary">Guest reviews</p>
                <h2 id="all-reviews-title" className="mt-1 text-xl font-bold text-foreground">All {totalReviews} reviews</h2>
              </div>
              <button type="button" onClick={() => setOpen(false)} className="rounded-full p-2 text-muted-foreground transition hover:bg-muted hover:text-foreground" aria-label="Close all reviews"><X size={18} /></button>
            </div>

            {loading ? <p className="py-10 text-center text-sm text-muted-foreground">Loading reviews…</p> : error ? <div className="mt-5 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}<button type="button" onClick={() => void loadPage(page)} className="ml-2 font-semibold underline">Retry</button></div> : <div className="mt-5 space-y-3">{reviews.map((review) => <ReviewCard key={review.id} review={review} />)}</div>}

            {!loading && !error && totalReviews > 0 && (
              <nav aria-label="Review pages" className="mt-5 flex items-center justify-between border-t border-border pt-4">
                <button type="button" onClick={() => void loadPage(pageState.page - 1)} disabled={!pageState.hasPrevious} className="inline-flex items-center gap-1 rounded-xl border border-border px-3 py-2 text-xs font-semibold text-muted-foreground transition hover:border-primary/30 hover:text-primary disabled:cursor-not-allowed disabled:opacity-40"><ChevronLeft size={15} /> Previous</button>
                <span className="text-xs font-semibold text-muted-foreground">Page {pageState.page} of {pageState.totalPages}</span>
                <button type="button" onClick={() => void loadPage(pageState.page + 1)} disabled={!pageState.hasNext} className="inline-flex items-center gap-1 rounded-xl border border-border px-3 py-2 text-xs font-semibold text-muted-foreground transition hover:border-primary/30 hover:text-primary disabled:cursor-not-allowed disabled:opacity-40">Next <ChevronRight size={15} /></button>
              </nav>
            )}
          </section>
        </div>
      )}
    </>
  );
}
