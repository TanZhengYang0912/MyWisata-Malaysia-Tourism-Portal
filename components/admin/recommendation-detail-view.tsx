"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowLeft, ExternalLink, Mail, MapPin, Phone, ShieldCheck } from "lucide-react";
import { AdminConfirmDialog } from "@/components/admin/confirm-dialog";
import { AiDraftEmailModal } from "@/components/admin/ai-draft-email-modal";
import { RecommendationAiReviewPanel } from "@/components/admin/recommendation-ai-review-panel";
import { useActionFeedback } from "@/components/providers/action-feedback";
import { useAuth } from "@/components/providers/auth";
import { StatusBadge } from "@/components/shared/status-badge";
import { VerifiedContributorBadge } from "@/components/shared/verified-contributor-badge";
import { Button } from "@/components/ui/button";
import type { AdminRecommendationDetail } from "@/lib/recommendations/admin-detail";

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

function displayDate(value: string | null) {
  if (!value) return "Not recorded";
  return new Intl.DateTimeFormat("en-MY", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function EvidenceValue({ children }: { children: React.ReactNode }) {
  return <p className="mt-1 whitespace-pre-wrap text-sm leading-6 text-foreground">{children || "Not provided"}</p>;
}

export function RecommendationDetailView({ recommendationId }: { recommendationId: string }) {
  const { currentUser } = useAuth();
  const { showFeedback } = useActionFeedback();
  const [detail, setDetail] = useState<AdminRecommendationDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [action, setAction] = useState<ReviewAction | null>(null);
  const [reason, setReason] = useState("");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);

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
        setError(body.error?.message ?? "Unable to load recommendation.");
        return;
      }
      setDetail(body.data);
    } catch {
      setError("Unable to load recommendation.");
    } finally {
      setLoading(false);
    }
  }, [recommendationId]);

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
    setReason("");
    if (nextAction === "approve") setConfirmOpen(true);
  }

  function handleAiReason(
    suggestedAction: "request_changes" | "reject",
    feedbackDraft: string,
  ) {
    setAction(suggestedAction);
    setReason(feedbackDraft);
    setConfirmOpen(false);
    setError(null);
    requestAnimationFrame(() => {
      document.getElementById("review-reason")
        ?.scrollIntoView({ behavior: "smooth", block: "center" });
    });
  }

  function continueWithReason() {
    if (!action || action === "approve") return;
    if (reason.trim().length < 10) {
      setError("Please explain the decision in at least 10 characters.");
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
          reason: action === "approve" ? undefined : reason.trim(),
        }),
      });
      const body = await response.json().catch(() => null) as {
        error?: { message?: string };
      } | null;
      if (!response.ok) {
        const message = body?.error?.message ?? "Review failed.";
        setError(message);
        showFeedback("error", message);
        return;
      }
      showFeedback("success", action === "request_changes"
        ? "Changes requested."
        : `Recommendation ${action === "approve" ? "approved" : "rejected"}.`);
      setConfirmOpen(false);
      setAction(null);
      setReason("");
      await loadDetail();
    } catch {
      setError("Review failed.");
      showFeedback("error", "Review failed.");
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return <div className="p-6 text-sm text-muted-foreground sm:p-8">Loading recommendation evidence…</div>;
  }

  if (!detail) {
    return (
      <div className="p-6 sm:p-8">
        <Link href="/admin/recommendations" className="inline-flex items-center gap-2 text-sm text-primary">
          <ArrowLeft size={15} /> Back to recommendations
        </Link>
        <div className="mt-5 rounded-2xl border border-destructive/20 bg-destructive/5 p-5 text-sm text-destructive">
          {error ?? "Recommendation not found."}
        </div>
      </div>
    );
  }

  const isPending = detail.status === "pending";
  const isApproved = detail.status === "approved";
  const reasonAction = action === "reject" || action === "request_changes";
  const reviewDecision = isPending ? (
    <section className="rounded-2xl border border-border bg-card p-5 xl:sticky xl:top-6 xl:max-h-[calc(100vh-3rem)] xl:overflow-y-auto">
      <h2 className="font-bold text-foreground">Review decision</h2>
      <p className="mt-1 text-xs leading-5 text-muted-foreground">Review all evidence before taking an action.</p>
      {currentUser?.role === "super_admin" && (
        <div className="mt-4">
          <RecommendationAiReviewPanel
            recommendationId={detail.id}
            onUseReason={handleAiReason}
          />
        </div>
      )}
      <div className="mt-5 grid gap-2">
        <Button onClick={() => prepareAction("approve")}>Approve recommendation</Button>
        <Button variant="outline" onClick={() => prepareAction("request_changes")}>Request changes</Button>
        <Button variant="destructive" onClick={() => prepareAction("reject")}>Reject recommendation</Button>
      </div>
      {reasonAction && (
        <div className="mt-4">
          <label htmlFor="review-reason" className="text-xs font-semibold text-foreground">
            {action === "reject" ? "Rejection reason" : "Required changes"}
          </label>
          <textarea
            id="review-reason"
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            maxLength={500}
            rows={4}
            className="mt-2 w-full resize-y rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
            placeholder="Explain what the contributor needs to know (minimum 10 characters)"
          />
          <div className="mt-2 flex items-center justify-between gap-3">
            <span className="text-[11px] text-muted-foreground">{reason.length}/500</span>
            <Button size="sm" onClick={continueWithReason}>Continue</Button>
          </div>
        </div>
      )}
    </section>
  ) : null;

  return (
    <div className="p-6 sm:p-8">
      <Link href="/admin/recommendations" className="inline-flex items-center gap-2 text-sm font-medium text-primary hover:underline">
        <ArrowLeft size={15} /> Back to recommendations
      </Link>

      <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div id={EVIDENCE_TARGET_IDS.vendorName}>
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-primary">Recommendation evidence</p>
          <h1 className="mt-1 text-2xl font-bold text-foreground">{detail.name}</h1>
          <p className="mt-1 text-xs text-muted-foreground">Submitted {displayDate(detail.submittedAt)}</p>
        </div>
        <StatusBadge status={detail.status} />
      </div>

      {error && <div className="mt-5 rounded-xl bg-destructive/10 px-4 py-3 text-sm text-destructive">{error}</div>}

      <div className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <main className="space-y-6">
          <section className="rounded-2xl border border-border bg-card p-5">
            <h2 className="font-bold text-foreground">Submission evidence</h2>
            <div className="mt-5 grid gap-5">
              <div id={EVIDENCE_TARGET_IDS.description}>
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Description</p>
                <EvidenceValue>{detail.description}</EvidenceValue>
              </div>
              <div id={EVIDENCE_TARGET_IDS.whyRecommend}>
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Why this place is recommended</p>
                <EvidenceValue>{detail.whyRecommend}</EvidenceValue>
              </div>
              <div className="grid gap-5 sm:grid-cols-2">
                <div id={EVIDENCE_TARGET_IDS.category}>
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Category</p>
                  <EvidenceValue>{detail.category}</EvidenceValue>
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">State</p>
                  <EvidenceValue>{detail.state}</EvidenceValue>
                </div>
              </div>
            </div>
          </section>

          <section id={EVIDENCE_TARGET_IDS.location} className="rounded-2xl border border-border bg-card p-5">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="font-bold text-foreground">Google location</h2>
                <p className="mt-2 text-sm font-semibold text-foreground">{detail.location?.name ?? "Not provided"}</p>
                <p className="mt-1 text-sm leading-5 text-muted-foreground">{detail.location?.address ?? "No address recorded"}</p>
              </div>
              {mapUrl && (
                <a href={mapUrl} target="_blank" rel="noreferrer" className="inline-flex shrink-0 items-center gap-1.5 text-xs font-semibold text-primary hover:underline">
                  Open map <ExternalLink size={13} />
                </a>
              )}
            </div>
            {detail.location?.latitude != null && detail.location.longitude != null && (
              <p className="mt-4 inline-flex items-center gap-2 rounded-lg bg-muted px-3 py-2 text-xs text-muted-foreground">
                <MapPin size={14} /> {detail.location.latitude}, {detail.location.longitude}
              </p>
            )}
          </section>

        </main>

        <aside className="space-y-6">
          <section className="rounded-2xl border border-border bg-card p-5">
            <h2 className="font-bold text-foreground">Contributor</h2>
            <div className="mt-4 flex items-center gap-2">
              <p className="text-sm font-semibold text-foreground">{detail.author.name}</p>
              <VerifiedContributorBadge verified={detail.author.isKycVerified} />
            </div>
            <p className="mt-1 text-xs text-muted-foreground">{detail.author.email ?? "Email unavailable"}</p>
          </section>

          <section id={EVIDENCE_TARGET_IDS.contact} className="rounded-2xl border border-border bg-card p-5">
            <h2 className="font-bold text-foreground">Contact methods</h2>
            <div className="mt-4 space-y-3 text-sm">
              <p className="flex items-center gap-2"><Phone size={14} className="text-muted-foreground" /> {detail.contact.phone ?? "Not provided"}</p>
              <p className="flex items-center gap-2 break-all"><Mail size={14} className="shrink-0 text-muted-foreground" /> {detail.contact.email ?? "Not provided"}</p>
              <p className="flex items-start gap-2 break-all"><ExternalLink size={14} className="mt-0.5 shrink-0 text-muted-foreground" /> {detail.contact.website ?? "Not provided"}</p>
            </div>
            <p className="mt-4 text-[11px] leading-4 text-muted-foreground">Private submission data. Use only for moderation and approved vendor outreach.</p>
          </section>

          {detail.review && (
            <section className="rounded-2xl border border-border bg-card p-5">
              <h2 className="font-bold text-foreground">Review history</h2>
              <div className="mt-4 space-y-3 text-sm">
                <div>
                  <p className="text-xs text-muted-foreground">Reviewer</p>
                  <p className="font-medium">{detail.review.reviewer?.name ?? "Admin"}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Reviewed</p>
                  <p className="font-medium">{displayDate(detail.review.reviewedAt)}</p>
                </div>
                {detail.review.reason && (
                  <div>
                    <p className="text-xs text-muted-foreground">Decision reason</p>
                    <p className="mt-1 whitespace-pre-wrap leading-5">{detail.review.reason}</p>
                  </div>
                )}
              </div>
            </section>
          )}

          {detail.conversion && (
            <section className="rounded-2xl border border-primary/20 bg-primary/5 p-5">
              <h2 className="flex items-center gap-2 font-bold text-foreground"><ShieldCheck size={16} /> Vendor conversion</h2>
              <p className="mt-3 text-sm">{detail.conversion.vendorName ?? "Linked vendor"}</p>
              <Link href="/admin/vendors" className="mt-2 inline-flex text-xs font-semibold text-primary hover:underline">Open Vendor Management</Link>
            </section>
          )}

          {isApproved && (
            <section className="rounded-2xl border border-border bg-card p-5">
              <h2 className="font-bold text-foreground">Vendor outreach</h2>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">
                Draft an invitation with AI, review the message, then send it to the vendor.
              </p>
              <Button className="mt-4 w-full gap-2" onClick={() => setInviteOpen(true)}>
                <Mail size={14} /> Invite vendor
              </Button>
            </section>
          )}

        </aside>

        <div className="grid gap-6 xl:col-span-2 xl:grid-cols-[minmax(320px,0.8fr)_minmax(520px,1.2fr)] xl:items-start">
          <section id={EVIDENCE_TARGET_IDS.photos} className="rounded-2xl border border-border bg-card p-5">
            <h2 className="font-bold text-foreground">Submission photos</h2>
            {detail.images.length === 0 ? (
              <p className="mt-3 text-sm text-muted-foreground">No photos were attached to this submission.</p>
            ) : (
              <div className="mt-4 grid grid-cols-2 gap-3">
                {detail.images.map((image, index) => (
                  <a key={image.id} href={image.url} target="_blank" rel="noreferrer" className="group relative aspect-[4/3] overflow-hidden rounded-xl border border-border bg-muted">
                    {/* Signed Supabase URLs should be loaded directly; Next's image loader does not own this private bucket. */}
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={image.url}
                      alt={`${detail.name} submission photo ${index + 1}`}
                      loading="lazy"
                      decoding="async"
                      className="h-full w-full object-cover transition-transform group-hover:scale-[1.02]"
                    />
                  </a>
                ))}
              </div>
            )}
            <p className="mt-3 text-xs text-muted-foreground">
              Image rights attested: {displayDate(detail.imageAttestedAt)}
            </p>
          </section>
          {reviewDecision}
        </div>
      </div>

      <AdminConfirmDialog
        open={confirmOpen}
        title={action === "approve" ? "Approve recommendation?" : action === "reject" ? "Reject recommendation?" : "Request changes?"}
        description={action === "approve"
          ? "This records the approval and notifies the contributor."
          : "This records the decision and shares your reason with the contributor."}
        confirmLabel={action === "approve" ? "Approve" : action === "reject" ? "Reject" : "Request changes"}
        confirmVariant={action === "approve" ? "default" : "destructive"}
        busy={submitting}
        onCancel={() => setConfirmOpen(false)}
        onConfirm={submitReview}
      />

      <AiDraftEmailModal
        open={inviteOpen}
        target={inviteOpen ? { id: detail.id, name: detail.name, defaultEmail: detail.contact.email ?? undefined } : null}
        title={`Invite ${detail.name}`}
        draftUrl="/api/admin/vendors/recommendation-invite/draft"
        sendUrl="/api/admin/vendors/recommendation-invite"
        extraBody={{ recommendationId: detail.id }}
        sendLabel="Send invite"
        linkHint="The real sign-up link is appended automatically when you send — no need to include it."
        onClose={() => setInviteOpen(false)}
        onSent={() => {
          setInviteOpen(false);
          showFeedback("success", "Invite sent.");
          void loadDetail();
        }}
      />
    </div>
  );
}
