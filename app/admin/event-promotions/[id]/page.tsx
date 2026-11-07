"use client";

import { use, useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useTranslation } from "react-i18next";
import { ArrowLeft } from "lucide-react";
import { AdminPageHeader, AdminPageShell } from "@/components/admin/admin-page-shell";
import { AdminConfirmDialog } from "@/components/admin/confirm-dialog";
import { formatMYR } from "@/lib/i18n/format";
import { useActionFeedback } from "@/components/providers/action-feedback";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { StatusBadge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";

import { useVisibleReviewRefresh } from "@/hooks/use-visible-review-refresh";

interface AdminEventPromotionDetail {
  id: string;
  vendorId: string;
  vendorName: string;
  title: string;
  details: string;
  startDate: string;
  endDate: string;
  posterUrl: string;
  status: "pending" | "approved" | "paid" | "rejected" | "changes_requested" | "paused";
  rejectionReason: string | null;
  changesRequestedReason: string | null;
  amountSen: number | null;
  paymentMethod: "wallet" | "stripe" | null;
  paidAt: string | null;
  createdAt: string;
}

type ReviewAction = "approve" | "reject" | "request_changes";
type VisibilityAction = "pause" | "resume";
type Action = ReviewAction | VisibilityAction;

export default function AdminEventPromotionDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { t } = useTranslation("admin");
  const { showFeedback } = useActionFeedback();
  const [detail, setDetail] = useState<AdminEventPromotionDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [submittingAction, setSubmittingAction] = useState<Action | null>(null);
  const [pendingAction, setPendingAction] = useState<Action | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);

  const snapshot = useRef<string | null>(null);
  const load = useCallback(async (signal?: AbortSignal) => {
    if (!signal) setLoading(true);
    try {
      const response = await fetch(`/api/admin/event-promotions/${id}${signal ? "?refresh=1" : ""}`, { cache: "no-store", signal });
      const body = await response.json().catch(() => ({}));
      if (response.status === 401 || response.status === 403) { setDetail(null); setPendingAction(null); throw Object.assign(new Error(t("reviewRefresh.denied")), { status: response.status }); }
      if (!response.ok) throw new Error(body.error?.message ?? (response.status === 404 ? t("eventPromotions.errors.notFound") : t("eventPromotions.errors.load")));
      const next = body.data?.promotion ?? null;
      const version = JSON.stringify(next);
      if (signal && snapshot.current && snapshot.current !== version) {
        setPendingAction(null);
        showFeedback("info", t("reviewRefresh.changed"));
      }
      snapshot.current = version;
      setDetail(next);
      setError(null);
    } catch (err) {
      if (signal) throw err;
      setError(err instanceof Error ? err.message : t("eventPromotions.errors.load"));
    } finally {
      if (!signal) setLoading(false);
    }
  }, [id, t, showFeedback]);

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void load(); }, [load]);
  const reviewRefresh = useVisibleReviewRefresh({ enabled: true, onRefresh: load });

  function requestReview(action: ReviewAction) {
    if (submittingAction) return;
    if (action !== "approve" && note.trim().length < 10) {
      showFeedback("error", t("eventPromotions.noteRequired"));
      return;
    }
    setPendingAction(action);
  }

  function requestVisibilityChange(action: VisibilityAction) {
    if (submittingAction) return;
    setPendingAction(action);
  }

  async function confirmReview() {
    if (!pendingAction) return;
    const action = pendingAction;
    const isVisibilityAction = action === "pause" || action === "resume";
    setSubmittingAction(action);
    try {
      const response = await fetch(`/api/admin/event-promotions/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, note: action === "approve" || isVisibilityAction ? undefined : note.trim() }),
      });
      const body = await response.json().catch(() => ({}));
      if (response.status === 409) await load();
      if (!response.ok) throw new Error(body.error?.message ?? t("eventPromotions.errors.review"));
      showFeedback("success", t(`eventPromotions.actions.${action}Success`));
      setNote("");
      await load();
    } catch (err) {
      showFeedback("error", err instanceof Error ? err.message : t("eventPromotions.errors.review"));
    } finally {
      setSubmittingAction(null);
      setPendingAction(null);
    }
  }

  const confirmCopy: Record<Action, { title: string; description: string; confirmLabel: string; confirmVariant: "default" | "destructive" }> = {
    approve: { title: t("eventPromotions.confirm.approveTitle"), description: t("eventPromotions.confirm.approveDescription"), confirmLabel: t("eventPromotions.actions.approve"), confirmVariant: "default" },
    request_changes: { title: t("eventPromotions.confirm.requestChangesTitle"), description: t("eventPromotions.confirm.requestChangesDescription"), confirmLabel: t("eventPromotions.actions.requestChanges"), confirmVariant: "default" },
    reject: { title: t("eventPromotions.confirm.rejectTitle"), description: t("eventPromotions.confirm.rejectDescription"), confirmLabel: t("eventPromotions.actions.reject"), confirmVariant: "destructive" },
    pause: { title: t("eventPromotions.confirm.pauseTitle"), description: t("eventPromotions.confirm.pauseDescription"), confirmLabel: t("eventPromotions.actions.pause"), confirmVariant: "destructive" },
    resume: { title: t("eventPromotions.confirm.resumeTitle"), description: t("eventPromotions.confirm.resumeDescription"), confirmLabel: t("eventPromotions.actions.resume"), confirmVariant: "default" },
  };

  return (
    <AdminPageShell>
      <div className="col-span-full flex flex-wrap items-center gap-3 py-2 text-xs text-muted-foreground"><Button type="button" size="sm" variant="outline" onClick={reviewRefresh.refresh}>{t("actions.refresh")}</Button><span role="status">{reviewRefresh.hasRefreshError ? t("reviewRefresh.stale") : t("dashboard.lastRefreshed")} · {reviewRefresh.lastSuccessAt ? new Date(reviewRefresh.lastSuccessAt).toLocaleTimeString() : "—"}</span></div>
      <Link href="/admin/event-promotions" className="inline-flex w-fit items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground">
        <ArrowLeft size={16} aria-hidden="true" />
        {t("eventPromotions.backToQueue")}
      </Link>

      {loading ? (
        <p className="text-sm text-muted-foreground">{t("eventPromotions.loading")}</p>
      ) : error || !detail ? (
        <p role="alert" className="rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">{error}</p>
      ) : (
        <>
          <AdminPageHeader
            title={detail.title}
            description={`${detail.vendorName} · ${detail.startDate === detail.endDate ? detail.startDate : `${detail.startDate} – ${detail.endDate}`}`}
            actions={<StatusBadge status={detail.status} />}
          />

          <div className="grid gap-5 md:grid-cols-[480px_1fr]">
            <button
              type="button"
              onClick={() => setPreviewOpen(true)}
              className="block overflow-hidden rounded-xl border border-border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={detail.posterUrl} alt="" className="h-72 w-full object-cover md:h-full" />
            </button>
            <div className="space-y-4">
              <p className="whitespace-pre-wrap text-sm leading-6 text-foreground">{detail.details}</p>
              {detail.status === "rejected" && detail.rejectionReason && (
                <p className="rounded-lg bg-destructive/5 p-3 text-xs text-destructive">{t("eventPromotions.rejectionNote", { note: detail.rejectionReason })}</p>
              )}
              {detail.status === "changes_requested" && detail.changesRequestedReason && (
                <p className="rounded-lg bg-amber-50 p-3 text-xs text-amber-900 dark:bg-amber-900/20 dark:text-amber-300">{t("eventPromotions.changesRequestedNote", { note: detail.changesRequestedReason })}</p>
              )}
              {detail.status === "approved" && (
                <p className="rounded-lg bg-secondary/40 p-3 text-xs text-muted-foreground">{t("eventPromotions.awaitingPayment")}</p>
              )}
              {(detail.status === "paid" || detail.status === "paused") && detail.amountSen !== null && (
                <p className="rounded-lg bg-secondary/40 p-3 text-xs text-muted-foreground">
                  {t("eventPromotions.paidNote", {
                    amount: formatMYR(detail.amountSen / 100),
                    method: t(`eventPromotions.paymentMethods.${detail.paymentMethod ?? "wallet"}`),
                  })}
                </p>
              )}
              {detail.status === "paused" && (
                <p className="rounded-lg bg-amber-50 p-3 text-xs text-amber-900 dark:bg-amber-900/20 dark:text-amber-300">{t("eventPromotions.pausedNote")}</p>
              )}
            </div>
          </div>

          {(detail.status === "paid" || detail.status === "paused") && (
            <section className="space-y-3 rounded-xl border border-border bg-card p-5">
              <h2 className="text-sm font-semibold text-foreground">{t("eventPromotions.visibilityHeading")}</h2>
              <div className="flex flex-wrap gap-2">
                {detail.status === "paid" && (
                  <Button type="button" variant="outline" disabled={submittingAction !== null} onClick={() => requestVisibilityChange("pause")}>
                    {t("eventPromotions.actions.pause")}
                  </Button>
                )}
                {detail.status === "paused" && (
                  <Button type="button" disabled={submittingAction !== null} onClick={() => requestVisibilityChange("resume")}>
                    {t("eventPromotions.actions.resume")}
                  </Button>
                )}
              </div>
            </section>
          )}

          {detail.status === "pending" && (
            <section className="space-y-3 rounded-xl border border-border bg-card p-5">
              <h2 className="text-sm font-semibold text-foreground">{t("eventPromotions.reviewHeading")}</h2>
              <Textarea
                value={note}
                onChange={(event) => setNote(event.target.value)}
                placeholder={t("eventPromotions.notePlaceholder")}
                maxLength={1000}
                rows={3}
              />
              <div className="flex flex-wrap gap-2">
                <Button type="button" disabled={submittingAction !== null} onClick={() => requestReview("approve")}>
                  {t("eventPromotions.actions.approve")}
                </Button>
                <Button type="button" variant="outline" disabled={submittingAction !== null} onClick={() => requestReview("request_changes")}>
                  {t("eventPromotions.actions.requestChanges")}
                </Button>
                <Button type="button" variant="outline" disabled={submittingAction !== null} onClick={() => requestReview("reject")}>
                  {t("eventPromotions.actions.reject")}
                </Button>
              </div>
            </section>
          )}

          <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
            <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto overscroll-contain sm:max-w-2xl">
              <DialogTitle className="sr-only">{detail.title}</DialogTitle>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={detail.posterUrl} alt="" className="max-h-[calc(100dvh-8rem)] w-full rounded-lg object-contain" />
            </DialogContent>
          </Dialog>
        </>
      )}

      {pendingAction && (
        <AdminConfirmDialog
          open
          title={confirmCopy[pendingAction].title}
          description={confirmCopy[pendingAction].description}
          confirmLabel={confirmCopy[pendingAction].confirmLabel}
          confirmVariant={confirmCopy[pendingAction].confirmVariant}
          busy={submittingAction !== null}
          onCancel={() => setPendingAction(null)}
          onConfirm={() => void confirmReview()}
        />
      )}
    </AdminPageShell>
  );
}
