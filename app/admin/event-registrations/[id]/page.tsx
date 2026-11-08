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
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { StatusBadge } from "@/components/ui/badge";
import { useAppDialog } from "@/components/providers/app-dialog";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";

import { useVisibleReviewRefresh } from "@/hooks/use-visible-review-refresh";

interface AdminCampaignProduct {
  id: string;
  name: string;
  price: number;
  imageUrl: string | null;
  itemKind: "product" | "service";
  dailyQuantity: number;
  active: boolean;
}

interface AdminCampaignRegistrationDetail {
  id: string;
  campaignId: string;
  campaignTitle: string;
  locationName: string;
  vendorId: string;
  vendorName: string;
  stallNumber: string;
  requestedStallNumber?: string | null;
  locationMaxStalls?: number | null;
  locationOccupiedStalls?: number;
  locationApprovalsCloseAt?: string | null;
  stallDescription: string;
  stallPosterUrl: string;
  status: "pending" | "approved" | "rejected" | "changes_requested" | "withdrawn" | "removed";
  rejectionReason: string | null;
  closedReason?: string | null;
  changesRequestedReason: string | null;
  products: AdminCampaignProduct[];
  createdAt: string;
  updatedAt: string;
}

type ReviewAction = "approve" | "reject" | "request_changes";

export default function EventRegistrationDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { t } = useTranslation("admin");
  const { showFeedback } = useActionFeedback();
  const [detail, setDetail] = useState<AdminCampaignRegistrationDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [confirmedStall, setConfirmedStall] = useState("");
  const [submittingAction, setSubmittingAction] = useState<ReviewAction | null>(null);
  const [pendingAction, setPendingAction] = useState<ReviewAction | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [stallEditOpen, setStallEditOpen] = useState(false);
  const [stallNumber, setStallNumber] = useState("");
  const [stallReason, setStallReason] = useState("");
  const [changingStall, setChangingStall] = useState(false);
  const { prompt } = useAppDialog();

  async function saveStall() {
    if (!detail || !stallNumber.trim() || (stallNumber.trim() !== detail.stallNumber && stallReason.trim().length < 5)) {
      showFeedback("error", t("eventRegistrations.stallChangeInvalid")); return;
    }
    setChangingStall(true);
    try {
      const response = await fetch(`/api/admin/event-registrations/${id}/stall`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stallNumber: stallNumber.trim(), expectedUpdatedAt: detail.updatedAt,
          ...(stallReason.trim() ? { reason: stallReason.trim() } : {}) }),
      });
      const body = await response.json();
      if (response.status === 401 || response.status === 403) { setDetail(null); setPendingAction(null); }
      if (!response.ok) throw new Error(t(`promotionCampaigns.locations.errors.${body.error?.code || "SAVE_FAILED"}`));
      showFeedback("success", t(body.data?.notificationQueued ? "eventRegistrations.notificationQueued" : "eventRegistrations.stallUnchanged"));
      setStallEditOpen(false);
      await load();
    } catch (error) { showFeedback("error", error instanceof Error ? error.message : t("eventRegistrations.errors.review")); }
    finally { setChangingStall(false); }
  }


  const snapshot = useRef<string | null>(null);
  const load = useCallback(async (signal?: AbortSignal) => {
    if (!signal) setLoading(true);
    try {
      const response = await fetch(`/api/admin/event-registrations/${id}${signal ? "?refresh=1" : ""}`, { cache: "no-store", signal });
      const body = await response.json().catch(() => ({}));
      if (response.status === 401 || response.status === 403) { setDetail(null); setPendingAction(null); throw Object.assign(new Error(t("reviewRefresh.denied")), { status: response.status }); }
      if (!response.ok) throw new Error(body.error?.message ?? (response.status === 404 ? t("eventRegistrations.errors.notFound") : t("eventRegistrations.errors.load")));
      const next = body.data?.registration ?? null;
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
      setError(err instanceof Error ? err.message : t("eventRegistrations.errors.load"));
    } finally {
      if (!signal) setLoading(false);
    }
  }, [id, t, showFeedback]);

  useEffect(() => { void load(); }, [load]);
  const reviewRefresh = useVisibleReviewRefresh({ enabled: true, onRefresh: load });

  async function removeFromLocation() {
    const reason = await prompt(t("eventRegistrations.removePrompt"));
    if (reason === null) return;
    if (reason.trim().length < 5) {
      showFeedback("error", t("eventRegistrations.removeReasonRequired"));
      return;
    }
    setRemoving(true);
    try {
      const response = await fetch(`/api/admin/event-registrations/${id}/remove`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: reason.trim() }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error?.message ?? t("eventRegistrations.removeError"));
      showFeedback("success", t("eventRegistrations.removed"));
      await load();
    } catch (err) {
      showFeedback("error", err instanceof Error ? err.message : t("eventRegistrations.removeError"));
    } finally {
      setRemoving(false);
    }
  }

  function requestReview(action: ReviewAction) {
    if (submittingAction) return;
    if (action !== "approve" && note.trim().length < 10) {
      showFeedback("error", t("eventRegistrations.noteRequired"));
      return;
    }
    if (action === "approve" && !confirmedStall.trim()) {
      showFeedback("error", t("eventRegistrations.confirmedStallRequired")); return;
    }
    setPendingAction(action);
  }

  async function confirmReview() {
    if (!pendingAction) return;
    const action = pendingAction;
    setSubmittingAction(action);
    try {
      const response = await fetch(`/api/admin/event-registrations/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, note: action === "approve" ? undefined : note.trim(),
          ...(action === "approve" ? { stallNumber: confirmedStall.trim(), expectedUpdatedAt: detail?.updatedAt } : {}) }),
      });
      const body = await response.json().catch(() => ({}));
      if (response.status === 409) await load();
      if (!response.ok) throw new Error(t(`promotionCampaigns.locations.errors.${body.error?.code || "SAVE_FAILED"}`));
      showFeedback("success", t(body.data?.notificationQueued ? "eventRegistrations.notificationQueued" : `eventRegistrations.actions.${action}Success`));
      setNote("");
      await load();
    } catch (err) {
      showFeedback("error", err instanceof Error ? err.message : t("eventRegistrations.errors.review"));
    } finally {
      setSubmittingAction(null);
      setPendingAction(null);
    }
  }

  const confirmCopy: Record<ReviewAction, { title: string; description: string; confirmLabel: string; confirmVariant: "default" | "destructive" }> = {
    approve: { title: t("eventRegistrations.confirm.approveTitle"), description: t("eventRegistrations.confirm.approveDescription", { number: confirmedStall.trim() }), confirmLabel: t("eventRegistrations.actions.approve"), confirmVariant: "default" },
    request_changes: { title: t("eventRegistrations.confirm.requestChangesTitle"), description: t("eventRegistrations.confirm.requestChangesDescription"), confirmLabel: t("eventRegistrations.actions.requestChanges"), confirmVariant: "default" },
    reject: { title: t("eventRegistrations.confirm.rejectTitle"), description: t("eventRegistrations.confirm.rejectDescription"), confirmLabel: t("eventRegistrations.actions.reject"), confirmVariant: "destructive" },
  };

  return (
    <AdminPageShell>
      <div className="col-span-full flex flex-wrap items-center gap-3 py-2 text-xs text-muted-foreground"><Button type="button" size="sm" variant="outline" onClick={reviewRefresh.refresh}>{t("actions.refresh")}</Button><span role="status">{reviewRefresh.hasRefreshError ? t("reviewRefresh.stale") : t("dashboard.lastRefreshed")} · {reviewRefresh.lastSuccessAt ? new Date(reviewRefresh.lastSuccessAt).toLocaleTimeString() : "—"}</span></div>
      <Link href="/admin/event-registrations" className="inline-flex w-fit items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground">
        <ArrowLeft size={16} aria-hidden="true" />
        {t("eventRegistrations.backToQueue")}
      </Link>

      {loading ? (
        <p className="text-sm text-muted-foreground">{t("eventRegistrations.loading")}</p>
      ) : error || !detail ? (
        <p role="alert" className="rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">{error}</p>
      ) : (
        <>
          <AdminPageHeader
            title={detail.vendorName}
            description={`${detail.campaignTitle} · ${detail.locationName} · ${detail.status === "approved" ? t("eventRegistrations.stallLabel", { number: detail.stallNumber }) : t("eventRegistrations.preferredStall", { number: detail.requestedStallNumber || t("eventRegistrations.adminAllocate") })}`}
            actions={<StatusBadge status={detail.status} />}
          />

          <div className="grid gap-5 md:grid-cols-[480px_1fr]">
            <button
              type="button"
              onClick={() => setPreviewOpen(true)}
              className="block overflow-hidden rounded-xl border border-border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={detail.stallPosterUrl} alt="" className="h-72 w-full object-cover md:h-full" />
            </button>
            <div className="space-y-4">
              <p className="whitespace-pre-wrap text-sm leading-6 text-foreground">{detail.stallDescription}</p>

              {detail.products.length > 0 && (
                <div>
                  <h2 className="text-sm font-semibold text-foreground">{t("eventRegistrations.productsHeading")}</h2>
                  <ul className="mt-2 divide-y divide-border rounded-xl border border-border">
                    {detail.products.map((product) => (
                      <li key={product.id} className="flex items-center gap-3 p-3">
                        {product.imageUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={product.imageUrl} alt="" className="h-12 w-12 shrink-0 rounded-lg object-cover" />
                        ) : (
                          <div className="h-12 w-12 shrink-0 rounded-lg bg-secondary" />
                        )}
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-medium text-foreground">{product.name}</span>
                          <span className="flex flex-wrap gap-x-2 text-xs text-muted-foreground">
                            <span>{t(`eventRegistrations.itemKinds.${product.itemKind}`)}</span>
                            <span>{t("eventRegistrations.dailyQuantity", { count: product.dailyQuantity })}</span>
                            {!product.active && <span className="text-destructive">{t("eventRegistrations.itemOff")}</span>}
                          </span>
                        </span>
                        <span className="shrink-0 text-sm font-semibold text-foreground">{product.price === 0 ? t("eventRegistrations.free") : formatMYR(product.price)}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {detail.status === "rejected" && detail.rejectionReason && (
                <p className="rounded-lg bg-destructive/5 p-3 text-xs text-destructive">{t("eventRegistrations.rejectionNote", { note: detail.rejectionReason })}</p>
              )}
              {(detail.status === "withdrawn" || detail.status === "removed") && (
                <p className="rounded-lg bg-destructive/5 p-3 text-xs text-destructive">{t(`eventRegistrations.closedNote.${detail.status}`, { note: detail.closedReason ?? "" })}</p>
              )}
              {detail.status === "changes_requested" && detail.changesRequestedReason && (
                <p className="rounded-lg bg-amber-50 p-3 text-xs text-amber-900 dark:bg-amber-900/20 dark:text-amber-300">{t("eventRegistrations.changesRequestedNote", { note: detail.changesRequestedReason })}</p>
              )}
            </div>
          </div>

          {detail.status === "pending" && (
            <section className="space-y-3 rounded-xl border border-border bg-card p-5">
              <h2 className="text-sm font-semibold text-foreground">{t("eventRegistrations.reviewHeading")}</h2>
              <label htmlFor="confirmed-stall-number" className="block text-sm font-semibold text-foreground">
                {t("eventRegistrations.confirmedStall")}
                <Input id="confirmed-stall-number" className="mt-1" value={confirmedStall} maxLength={40}
                  onChange={(event) => setConfirmedStall(event.target.value)} />
              </label>
              <p className="text-xs text-muted-foreground">{detail.locationMaxStalls == null
                ? t("promotionCampaigns.locations.capacityUnconfirmed")
                : t("promotionCampaigns.locations.capacitySummary", { occupied: detail.locationOccupiedStalls ?? 0,
                  capacity: detail.locationMaxStalls, remaining: Math.max(0, detail.locationMaxStalls - (detail.locationOccupiedStalls ?? 0)) })}</p>
              <Textarea
                value={note}
                onChange={(event) => setNote(event.target.value)}
                placeholder={t("eventRegistrations.notePlaceholder")}
                maxLength={1000}
                rows={3}
              />
              <div className="flex flex-wrap gap-2">
                <Button type="button" disabled={submittingAction !== null || detail.locationMaxStalls == null || (detail.locationOccupiedStalls ?? 0) >= detail.locationMaxStalls} onClick={() => requestReview("approve")}>
                  {t("eventRegistrations.actions.approve")}
                </Button>
                <Button type="button" variant="outline" disabled={submittingAction !== null} onClick={() => requestReview("request_changes")}>
                  {t("eventRegistrations.actions.requestChanges")}
                </Button>
                <Button type="button" variant="outline" disabled={submittingAction !== null} onClick={() => requestReview("reject")}>
                  {t("eventRegistrations.actions.reject")}
                </Button>
              </div>
            </section>
          )}

          {detail.status === "approved" && (
            <Button type="button" variant="outline" onClick={() => { setStallNumber(detail.stallNumber); setStallReason(""); setStallEditOpen(true); }}>
              {t("eventRegistrations.changeStall")}
            </Button>
          )}
          <Dialog open={stallEditOpen} onOpenChange={(open) => { if (!changingStall) setStallEditOpen(open); }}>
            <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto overscroll-contain">
              <DialogTitle className="break-words">{t("eventRegistrations.changeStall")}</DialogTitle>
              <p className="break-words text-sm text-muted-foreground">{detail.stallNumber} → {stallNumber || detail.stallNumber}</p>
              <label className="text-sm font-semibold">
                {t("eventRegistrations.stallNumberLabel")}
                <Input value={stallNumber} maxLength={40} onChange={(event) => setStallNumber(event.target.value)} />
              </label>
              <label className="text-sm font-semibold">
                {t("eventRegistrations.changeReason")}
                <Textarea value={stallReason} maxLength={500} onChange={(event) => setStallReason(event.target.value)} />
              </label>
              <p className="text-xs text-muted-foreground">{t("eventRegistrations.stallNotificationDescription")}</p>
              <Button disabled={changingStall} onClick={() => void saveStall()}>{t("eventRegistrations.confirmStallChange")}</Button>
            </DialogContent>
          </Dialog>

          {detail.status === "approved" && (
            <section className="space-y-2 rounded-xl border border-destructive/30 bg-card p-5">
              <h2 className="text-sm font-semibold text-foreground">{t("eventRegistrations.removeHeading")}</h2>
              <p className="text-xs text-muted-foreground">{t("eventRegistrations.removeDescription")}</p>
              <Button type="button" variant="destructive" size="sm" disabled={removing} onClick={() => void removeFromLocation()}>
                {t("eventRegistrations.actions.remove")}
              </Button>
            </section>
          )}

          <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
            <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto overscroll-contain sm:max-w-2xl">
              <DialogTitle className="sr-only">{detail.vendorName}</DialogTitle>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={detail.stallPosterUrl} alt="" className="max-h-[calc(100dvh-8rem)] w-full rounded-lg object-contain" />
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
