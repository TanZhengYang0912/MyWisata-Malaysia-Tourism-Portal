"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { ArrowLeft, ExternalLink, Mail, MapPin, Phone, ShieldCheck } from "lucide-react";
import { AdminConfirmDialog } from "@/components/admin/confirm-dialog";
import { AdminPageHeader } from "@/components/admin/admin-page-shell";
import { AiDraftEmailModal } from "@/components/admin/ai-draft-email-modal";
import { RecommendationAiReviewPanel } from "@/components/admin/recommendation-ai-review-panel";
import { useActionFeedback } from "@/components/providers/action-feedback";
import { useAuth } from "@/components/providers/auth";
import { StatusBadge } from "@/components/shared/status-badge";
import { VerifiedContributorBadge } from "@/components/shared/verified-contributor-badge";
import { Button } from "@/components/ui/button";
import type { AdminRecommendationDetail } from "@/lib/recommendations/admin-detail";
import { DEFAULT_LOCALE, isAppLocale } from "@/lib/i18n/locale";

type ReviewAction = "approve" | "reject" | "request_changes";

const EVIDENCE_TARGET_IDS = {
  vendorName: "recommendation-field-vendor-name",
  description: "recommendation-field-description",
  whyRecommend: "recommendation-field-why-recommend",
  category: "recommendation-field-category",
  location: "recommendation-field-location",
  photos: "recommendation-field-photos",
  contact: "recommendation-field-contact",
} as const;

function displayDate(value: string | null, locale: string, emptyLabel: string) {
  if (!value) return emptyLabel;
  return new Intl.DateTimeFormat(locale, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function EvidenceValue({ children, emptyLabel }: { children: React.ReactNode; emptyLabel: string }) {
  return <p className="mt-1 whitespace-pre-wrap text-sm leading-6 text-foreground">{children || emptyLabel}</p>;
}

export function RecommendationDetailView({ recommendationId }: { recommendationId: string }) {
  const { t, i18n } = useTranslation("admin");
  const locale = isAppLocale(i18n.resolvedLanguage) ? i18n.resolvedLanguage : DEFAULT_LOCALE;
  const { currentUser } = useAuth();
  const { showFeedback } = useActionFeedback();
  const [detail, setDetail] = useState<AdminRecommendationDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [action, setAction] = useState<ReviewAction | null>(null);
  const [internalNote, setInternalNote] = useState("");
  const [customerMessage, setCustomerMessage] = useState("");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [localizationBusy, setLocalizationBusy] = useState(false);
  const [translationEdits, setTranslationEdits] = useState<Record<string, string>>({});

  const loadDetail = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/admin/recommendations/${recommendationId}`, {
        cache: "no-store",
      });
      const body = (await response.json()) as {
        data: AdminRecommendationDetail | null;
        error: { message: string } | null;
      };
      if (!response.ok || !body.data) {
        setError(body.error?.message ?? t("recommendation.detail.errors.loadFailed"));
        return;
      }
      setDetail(body.data);
    } catch {
      setError(t("recommendation.detail.errors.loadFailed"));
    } finally {
      setLoading(false);
    }
  }, [recommendationId, t]);

  useEffect(() => {
    void Promise.resolve().then(loadDetail);
  }, [loadDetail]);

  const mapUrl = useMemo(() => {
    if (!detail?.location) return null;
    const query = detail.location.latitude != null && detail.location.longitude != null
      ? `${detail.location.latitude},${detail.location.longitude}`
      : detail.location.address ?? detail.location.name;
    if (!query) return null;
    const params = new URLSearchParams({ api: "1", query });
    if (detail.location.placeId) params.set("query_place_id", detail.location.placeId);
    return `https://www.google.com/maps/search/?${params.toString()}`;
  }, [detail]);

  function prepareAction(nextAction: ReviewAction) {
    setAction(nextAction);
    setCustomerMessage("");
    if (nextAction === "approve") setConfirmOpen(true);
  }

  function handleAiReason(
    suggestedAction: "request_changes" | "reject",
    feedbackDraft: string,
  ) {
    setAction(suggestedAction);
    setCustomerMessage(feedbackDraft);
    setConfirmOpen(false);
    setError(null);
    requestAnimationFrame(() => {
      document.getElementById("review-reason")
        ?.scrollIntoView({ behavior: "smooth", block: "center" });
    });
  }

  function continueWithReason() {
    if (!action || action === "approve") return;
    if (customerMessage.trim().length < 10) {
      setError(t("recommendation.detail.errors.reasonTooShort"));
      return;
    }
    setError(null);
    setConfirmOpen(true);
  }

  async function submitReview() {
    if (!action || submitting) return;
    setSubmitting(true);
    try {
      const response = await fetch("/api/admin/recommendations/review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          recommendationId,
          action,
          internalNote: internalNote.trim() || undefined,
          customerMessage: action === "approve" ? undefined : customerMessage.trim(),
        }),
      });
      const body = await response.json().catch(() => null) as {
        error?: { message?: string };
      } | null;
      if (!response.ok) {
        const message = body?.error?.message ?? t("recommendation.detail.errors.reviewFailed");
        setError(message);
        showFeedback("error", message);
        return;
      }
      showFeedback("success", action === "request_changes"
        ? t("recommendation.detail.feedback.changesRequested")
        : action === "approve"
          ? t("recommendation.detail.feedback.approved")
          : t("recommendation.detail.feedback.rejected"));
      setConfirmOpen(false);
      setAction(null);
      setInternalNote("");
      setCustomerMessage("");
      await loadDetail();
    } catch {
      setError(t("recommendation.detail.errors.reviewFailed"));
      showFeedback("error", t("recommendation.detail.errors.reviewFailed"));
    } finally {
      setSubmitting(false);
    }
  }

  async function submitLocalization(action: "suggest_place" | "confirm_place" | "clear_place" | "generate", placeId?: string) {
    if (localizationBusy) return;
    setLocalizationBusy(true);
    try {
      const response = await fetch(`/api/admin/recommendations/${recommendationId}/localization`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, placeId }),
      });
      const body = await response.json().catch(() => null) as { error?: { message?: string } } | null;
      if (!response.ok) throw new Error(body?.error?.message ?? t("recommendation.detail.errors.localizationFailed"));
      showFeedback("success", action === "generate" ? t("recommendation.detail.localization.draftsGenerated") : t("recommendation.detail.localization.placeUpdated"));
      await loadDetail();
    } catch (localizationError) {
      const message = localizationError instanceof Error ? localizationError.message : t("recommendation.detail.errors.localizationFailed");
      setError(message);
      showFeedback("error", message);
    } finally {
      setLocalizationBusy(false);
    }
  }

  async function reviewTranslation(translationId: string, status: "approved" | "rejected", fallbackText: string) {
    if (localizationBusy) return;
    setLocalizationBusy(true);
    try {
      const response = await fetch(`/api/admin/recommendations/${recommendationId}/localization`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ translationId, status, translatedText: translationEdits[translationId] ?? fallbackText }),
      });
      const body = await response.json().catch(() => null) as { error?: { message?: string } } | null;
      if (!response.ok) throw new Error(body?.error?.message ?? t("recommendation.detail.errors.localizationFailed"));
      showFeedback("success", status === "approved" ? t("recommendation.detail.localization.draftApproved") : t("recommendation.detail.localization.draftRejected"));
      await loadDetail();
    } catch (localizationError) {
      const message = localizationError instanceof Error ? localizationError.message : t("recommendation.detail.errors.localizationFailed");
      setError(message);
      showFeedback("error", message);
    } finally {
      setLocalizationBusy(false);
    }
  }

  if (loading) {
    return <div className="p-6 sm:p-8"><AdminPageHeader title={t("recommendation.detail.recommendationEvidence")} /><p className="text-sm text-muted-foreground">{t("recommendation.detail.loading")}</p></div>;
  }

  if (!detail) {
    return (
      <div className="p-6 sm:p-8">
        <Link href="/admin/recommendations" className="inline-flex items-center gap-2 text-sm text-primary">
          <ArrowLeft size={15} /> {t("recommendation.detail.backToRecommendations")}
        </Link>
        <div className="mt-5"><AdminPageHeader title={t("recommendation.detail.recommendationEvidence")} /></div>
        <div className="mt-5 rounded-2xl border border-destructive/20 bg-destructive/5 p-5 text-sm text-destructive">
          {error ?? t("recommendation.detail.notFound")}
        </div>
      </div>
    );
  }

  const isPending = detail.status === "pending";
  const isApproved = detail.status === "approved";
  const canManageLocalization = currentUser?.role === "super_admin";
  const reasonAction = action === "reject" || action === "request_changes";
  const reviewDecision = detail.availableActions.length > 0 ? (
    <section className="rounded-2xl border border-border bg-card p-5 xl:sticky xl:top-6 xl:max-h-[calc(100vh-3rem)] xl:overflow-y-auto">
      <h2 className="font-bold text-foreground">{t("recommendation.detail.reviewDecision")}</h2>
      <p className="mt-1 text-xs leading-5 text-muted-foreground">{t("recommendation.detail.reviewDecisionHint")}</p>
      {currentUser?.role === "super_admin" && (
        <div className="mt-4">
          <RecommendationAiReviewPanel
            recommendationId={detail.id}
            onUseReason={handleAiReason}
          />
        </div>
      )}
      <label className="mt-4 block text-xs font-semibold text-foreground">
        {t("recommendation.detail.internalNote")}
        <textarea
          value={internalNote}
          onChange={(event) => setInternalNote(event.target.value)}
          maxLength={1000}
          rows={3}
          className="mt-2 w-full resize-y rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
          placeholder={t("recommendation.detail.internalNotePlaceholder")}
        />
        <span className="mt-1 block text-[11px] font-normal text-muted-foreground">
          {t("recommendation.detail.internalNoteHint")}
        </span>
      </label>
      <div className="mt-5 grid gap-2">
        {detail.availableActions.includes("approve") && <Button onClick={() => prepareAction("approve")}>{t("recommendation.detail.actions.approve")}</Button>}
        {detail.availableActions.includes("request_changes") && <Button variant="outline" onClick={() => prepareAction("request_changes")}>{t("recommendation.detail.actions.requestChanges")}</Button>}
        {detail.availableActions.includes("reject") && <Button variant="destructive" onClick={() => prepareAction("reject")}>{t("recommendation.detail.actions.reject")}</Button>}
      </div>
      {reasonAction && (
        <div className="mt-4">
          <label htmlFor="review-reason" className="text-xs font-semibold text-foreground">
            {action === "reject" ? t("recommendation.detail.rejectionReason") : t("recommendation.detail.requiredChanges")}
          </label>
          <textarea
            id="review-reason"
            value={customerMessage}
            onChange={(event) => setCustomerMessage(event.target.value)}
            maxLength={500}
            rows={4}
            className="mt-2 w-full resize-y rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
            placeholder={t("recommendation.detail.reasonPlaceholder")}
          />
          <div className="mt-2 flex items-center justify-between gap-3">
            <span className="text-[11px] text-muted-foreground">{customerMessage.length}/500</span>
            <Button size="sm" onClick={continueWithReason}>{t("recommendation.detail.actions.continue")}</Button>
          </div>
        </div>
      )}
    </section>
  ) : isPending ? (
    <section className="rounded-2xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-950">
      <h2 className="font-bold">{t("recommendation.detail.assignedElsewhere")}</h2>
      <p className="mt-1 text-xs leading-5">{t("recommendation.detail.assignedElsewhereHint")}</p>
    </section>
  ) : null;

  return (
    <div className="p-6 sm:p-8">
      <Link href="/admin/recommendations" className="inline-flex items-center gap-2 text-sm font-medium text-primary hover:underline">
        <ArrowLeft size={15} /> {t("recommendation.detail.backToRecommendations")}
      </Link>

      <div className="mt-5" id={EVIDENCE_TARGET_IDS.vendorName}>
        <AdminPageHeader
          eyebrow={t("recommendation.detail.recommendationEvidence")}
          title={detail.name}
          description={t("recommendation.detail.submitted", { date: displayDate(detail.submittedAt, locale, t("recommendation.detail.notRecorded")) })}
          actions={<StatusBadge status={detail.status} />}
        />
      </div>

      {error && <div className="mt-5 rounded-xl bg-destructive/10 px-4 py-3 text-sm text-destructive">{error}</div>}

      <div className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-6">
          <section className="rounded-2xl border border-border bg-card p-5">
            <h2 className="font-bold text-foreground">{t("recommendation.detail.submissionEvidence")}</h2>
            <div className="mt-5 grid gap-5">
              <div id={EVIDENCE_TARGET_IDS.description}>
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t("recommendation.detail.fields.description")}</p>
                <EvidenceValue emptyLabel={t("recommendation.detail.notProvided")}>{detail.description}</EvidenceValue>
              </div>
              <div id={EVIDENCE_TARGET_IDS.whyRecommend}>
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t("recommendation.detail.fields.whyRecommended")}</p>
                <EvidenceValue emptyLabel={t("recommendation.detail.notProvided")}>{detail.whyRecommend}</EvidenceValue>
              </div>
              <div className="grid gap-5 sm:grid-cols-2">
                <div id={EVIDENCE_TARGET_IDS.category}>
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t("recommendation.detail.fields.category")}</p>
                  <EvidenceValue emptyLabel={t("recommendation.detail.notProvided")}>{detail.category}</EvidenceValue>
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t("recommendation.detail.fields.state")}</p>
                  <EvidenceValue emptyLabel={t("recommendation.detail.notProvided")}>{detail.state}</EvidenceValue>
                </div>
              </div>
            </div>
          </section>

          <section id={EVIDENCE_TARGET_IDS.location} className="rounded-2xl border border-border bg-card p-5">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="font-bold text-foreground">{t("recommendation.detail.fields.googleLocation")}</h2>
                <p className="mt-2 text-sm font-semibold text-foreground">{detail.location?.name ?? t("recommendation.detail.notProvided")}</p>
                <p className="mt-1 text-sm leading-5 text-muted-foreground">{detail.location?.address ?? t("recommendation.detail.noAddressRecorded")}</p>
              </div>
              {mapUrl && (
                <a href={mapUrl} target="_blank" rel="noreferrer" className="inline-flex shrink-0 items-center gap-1.5 text-xs font-semibold text-primary hover:underline">
                  {t("recommendation.detail.openMap")} <ExternalLink size={13} />
                </a>
              )}
            </div>
            {detail.location?.latitude != null && detail.location.longitude != null && (
              <p className="mt-4 inline-flex items-center gap-2 rounded-lg bg-muted px-3 py-2 text-xs text-muted-foreground">
                <MapPin size={14} /> {detail.location.latitude}, {detail.location.longitude}
              </p>
            )}
          </section>

          {canManageLocalization && (
            <section className="rounded-2xl border border-border bg-card p-5">
              <h2 className="font-bold text-foreground">{t("recommendation.detail.localization.title")}</h2>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">{t("recommendation.detail.localization.hint")}</p>
              <div className="mt-4 flex flex-wrap gap-2">
                <Button size="sm" variant="outline" disabled={localizationBusy} onClick={() => submitLocalization("suggest_place")}>{t("recommendation.detail.localization.suggestPlace")}</Button>
                {detail.localization.suggestedPlace && !detail.localization.resolvedPlace && <Button size="sm" disabled={localizationBusy} onClick={() => submitLocalization("confirm_place", detail.localization.suggestedPlace?.id)}>{t("recommendation.detail.localization.confirmPlace", { name: detail.localization.suggestedPlace.name })}</Button>}
                {detail.localization.resolvedPlace && <Button size="sm" variant="outline" disabled={localizationBusy} onClick={() => submitLocalization("clear_place")}>{t("recommendation.detail.localization.clearPlace")}</Button>}
                {isApproved && <Button size="sm" disabled={localizationBusy} onClick={() => submitLocalization("generate")}>{t("recommendation.detail.localization.generate")}</Button>}
              </div>
              <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
                <div><dt className="text-xs font-semibold text-muted-foreground">{t("recommendation.detail.localization.suggested")}</dt><dd className="mt-1 font-medium">{detail.localization.suggestedPlace?.name ?? t("recommendation.detail.notProvided")}</dd></div>
                <div><dt className="text-xs font-semibold text-muted-foreground">{t("recommendation.detail.localization.confirmed")}</dt><dd className="mt-1 font-medium">{detail.localization.resolvedPlace?.name ?? t("recommendation.detail.notProvided")}</dd></div>
              </dl>
              {detail.localization.translations.length > 0 && <div className="mt-5 space-y-4 border-t border-border pt-4">
                {detail.localization.translations.map((translation) => <div key={translation.id} className="rounded-xl bg-muted/50 p-3">
                  <p className="text-xs font-semibold text-muted-foreground">{t("recommendation.detail.localization.draftLabel", { field: t(`recommendation.detail.localization.fields.${translation.field}`), locale: translation.locale })}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{translation.sourceText}</p>
                  <textarea value={translationEdits[translation.id] ?? translation.translatedText} onChange={(event) => setTranslationEdits((current) => ({ ...current, [translation.id]: event.target.value }))} readOnly={translation.status !== "draft"} maxLength={2000} className="mt-2 w-full rounded-lg border border-border bg-background p-2 text-sm" />
                  <div className="mt-2 flex items-center justify-between gap-2"><span className="text-xs font-semibold text-muted-foreground">{t(`recommendation.detail.localization.status.${translation.status}`)}</span><span className="flex gap-2">{translation.status === "draft" && <><Button size="sm" disabled={localizationBusy} onClick={() => reviewTranslation(translation.id, "approved", translation.translatedText)}>{t("recommendation.detail.localization.approveDraft")}</Button><Button size="sm" variant="outline" disabled={localizationBusy} onClick={() => reviewTranslation(translation.id, "rejected", translation.translatedText)}>{t("recommendation.detail.localization.rejectDraft")}</Button></>}</span></div>
                </div>)}
              </div>}
            </section>
          )}

        </div>

        <aside className="space-y-6">
          <section className="rounded-2xl border border-border bg-card p-5">
            <h2 className="font-bold text-foreground">{t("recommendation.detail.contributor")}</h2>
            <div className="mt-4 flex items-center gap-2">
              <p className="text-sm font-semibold text-foreground">{detail.author.name}</p>
              <VerifiedContributorBadge verified={detail.author.isKycVerified} />
            </div>
            <p className="mt-1 text-xs text-muted-foreground">{detail.author.email ?? t("recommendation.detail.emailUnavailable")}</p>
          </section>

          <section id={EVIDENCE_TARGET_IDS.contact} className="rounded-2xl border border-border bg-card p-5">
            <h2 className="font-bold text-foreground">{t("recommendation.detail.contactMethods")}</h2>
            <div className="mt-4 space-y-3 text-sm">
              <p className="flex items-center gap-2"><Phone size={14} className="text-muted-foreground" /> {detail.contact.phone ?? t("recommendation.detail.notProvided")}</p>
              <p className="flex items-center gap-2 break-all"><Mail size={14} className="shrink-0 text-muted-foreground" /> {detail.contact.email ?? t("recommendation.detail.notProvided")}</p>
              <p className="flex items-start gap-2 break-all"><ExternalLink size={14} className="mt-0.5 shrink-0 text-muted-foreground" /> {detail.contact.website ?? t("recommendation.detail.notProvided")}</p>
            </div>
            <p className="mt-4 text-[11px] leading-4 text-muted-foreground">{t("recommendation.detail.privateSubmissionNotice")}</p>
          </section>

          {detail.review && (
            <section className="rounded-2xl border border-border bg-card p-5">
              <h2 className="font-bold text-foreground">{t("recommendation.detail.reviewHistory")}</h2>
              <div className="mt-4 space-y-3 text-sm">
                <div>
                  <p className="text-xs text-muted-foreground">{t("recommendation.detail.reviewer")}</p>
                  <p className="font-medium">{detail.review.reviewer?.name ?? t("recommendation.detail.admin")}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">{t("recommendation.detail.reviewed")}</p>
                  <p className="font-medium">{displayDate(detail.review.reviewedAt, locale, t("recommendation.detail.notRecorded"))}</p>
                </div>
                {detail.review.reason && (
                  <div>
                    <p className="text-xs text-muted-foreground">{t("recommendation.detail.decisionReason")}</p>
                    <p className="mt-1 whitespace-pre-wrap leading-5">{detail.review.reason}</p>
                  </div>
                )}
              </div>
            </section>
          )}

          {detail.reviewEvents.length > 0 && (
            <section className="rounded-2xl border border-border bg-card p-5">
              <h2 className="font-bold text-foreground">{t("recommendation.detail.decisionTimeline")}</h2>
              <div className="mt-4 space-y-4">
                {detail.reviewEvents.map((event) => (
                  <article key={event.id} className="border-b border-border pb-4 text-sm last:border-0 last:pb-0">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="font-semibold">{event.actor.name} · {event.action}</p>
                      <time className="text-xs text-muted-foreground">{displayDate(event.createdAt, locale, t("recommendation.detail.notRecorded"))}</time>
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">{event.fromStatus} → {event.toStatus}</p>
                    <div className="mt-3 rounded-lg bg-muted/50 p-3">
                      <p className="text-xs font-semibold text-muted-foreground">{t("recommendation.detail.customerMessage")}</p>
                      <p className="mt-1 whitespace-pre-wrap">{event.customerMessage}</p>
                    </div>
                    {event.internalNote && (
                      <div className="mt-2 rounded-lg border border-border p-3">
                        <p className="text-xs font-semibold text-muted-foreground">{t("recommendation.detail.internalNote")}</p>
                        <p className="mt-1 whitespace-pre-wrap">{event.internalNote}</p>
                      </div>
                    )}
                  </article>
                ))}
              </div>
            </section>
          )}

          {detail.conversion && (
            <section className="rounded-2xl border border-primary/20 bg-primary/5 p-5">
              <h2 className="flex items-center gap-2 font-bold text-foreground"><ShieldCheck size={16} /> {t("recommendation.detail.vendorConversion")}</h2>
              <p className="mt-3 text-sm">{detail.conversion.vendorName ?? t("recommendation.detail.linkedVendor")}</p>
              <Link href="/admin/vendors" className="mt-2 inline-flex text-xs font-semibold text-primary hover:underline">{t("recommendation.detail.openVendorManagement")}</Link>
            </section>
          )}

          {isApproved && (
            <section className="rounded-2xl border border-border bg-card p-5">
              <h2 className="font-bold text-foreground">{t("recommendation.detail.vendorOutreach")}</h2>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">
                {t("recommendation.detail.vendorOutreachHint")}
              </p>
              <Button className="mt-4 w-full gap-2" onClick={() => setInviteOpen(true)}>
                <Mail size={14} /> {t("recommendation.detail.inviteVendor")}
              </Button>
            </section>
          )}

        </aside>

        <div className="grid gap-6 xl:col-span-2 xl:grid-cols-[minmax(320px,0.8fr)_minmax(520px,1.2fr)] xl:items-start">
          <section id={EVIDENCE_TARGET_IDS.photos} className="rounded-2xl border border-border bg-card p-5">
            <h2 className="font-bold text-foreground">{t("recommendation.detail.submissionPhotos")}</h2>
            {detail.images.length === 0 ? (
              <p className="mt-3 text-sm text-muted-foreground">{t("recommendation.detail.noPhotos")}</p>
            ) : (
              <div className="mt-4 grid grid-cols-2 gap-3">
                {detail.images.map((image, index) => (
                  <a key={image.id} href={image.url} target="_blank" rel="noreferrer" className="group relative aspect-[4/3] overflow-hidden rounded-xl border border-border bg-muted">
                    {/* Signed Supabase URLs should be loaded directly; Next's image loader does not own this private bucket. */}
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={image.url}
                      alt={t("recommendation.detail.photoAlt", { name: detail.name, number: index + 1 })}
                      loading="lazy"
                      decoding="async"
                      className="h-full w-full object-cover transition-transform group-hover:scale-[1.02]"
                    />
                  </a>
                ))}
              </div>
            )}
            <p className="mt-3 text-xs text-muted-foreground">
              {t("recommendation.detail.imageRightsAttested", { date: displayDate(detail.imageAttestedAt, locale, t("recommendation.detail.notRecorded")) })}
            </p>
          </section>
          {reviewDecision}
        </div>
      </div>

      <AdminConfirmDialog
        open={confirmOpen}
        title={action === "approve" ? "recommendation.detail.confirm.approveTitle" : action === "reject" ? "recommendation.detail.confirm.rejectTitle" : "recommendation.detail.confirm.requestChangesTitle"}
        description={action === "approve"
          ? "recommendation.detail.confirm.approveDescription"
          : "recommendation.detail.confirm.decisionDescription"}
        confirmLabel={action === "approve" ? "recommendation.detail.actions.approve" : action === "reject" ? "recommendation.detail.actions.reject" : "recommendation.detail.actions.requestChanges"}
        confirmVariant={action === "approve" ? "default" : "destructive"}
        busy={submitting}
        onCancel={() => setConfirmOpen(false)}
        onConfirm={submitReview}
      />

      <AiDraftEmailModal
        open={inviteOpen}
        target={inviteOpen ? { id: detail.id, name: detail.name, defaultEmail: detail.contact.email ?? undefined } : null}
        title={t("recommendation.detail.inviteTitle", { name: detail.name })}
        draftUrl="/api/admin/vendors/recommendation-invite/draft"
        sendUrl="/api/admin/vendors/recommendation-invite"
        extraBody={{ recommendationId: detail.id }}
        sendLabel={t("recommendation.detail.sendInvite")}
        linkHint={t("recommendation.detail.inviteLinkHint")}
        onClose={() => setInviteOpen(false)}
        onSent={() => {
          setInviteOpen(false);
          showFeedback("success", t("recommendation.detail.feedback.inviteSent"));
          void loadDetail();
        }}
      />
    </div>
  );
}
