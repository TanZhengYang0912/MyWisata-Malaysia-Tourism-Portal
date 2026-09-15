"use client";

import { useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import type {
  ModerationAssessment,
  ModerationFinding,
  PhotoAssessment,
  RecommendationEvidenceField,
} from "@/lib/admin-ai/moderation";

type ReasonAction = "request_changes" | "reject";

interface RecommendationAiReviewPanelProps {
  recommendationId: string;
  onUseReason: (action: ReasonAction, reason: string) => void;
}

const FIELD_LABELS: Record<RecommendationEvidenceField, string> = {
  vendor_name: "recommendation.aiReview.fields.businessName",
  description: "recommendation.aiReview.fields.description",
  why_recommend: "recommendation.aiReview.fields.recommendationReason",
  category: "recommendation.aiReview.fields.category",
  location: "recommendation.aiReview.fields.googleLocation",
  contact: "recommendation.aiReview.fields.contactMethod",
  photos: "recommendation.aiReview.fields.photos",
  image_attestation: "recommendation.aiReview.fields.imageRights",
  duplicate: "recommendation.aiReview.fields.exactNameMatches",
  links: "recommendation.aiReview.fields.links",
};

const FINDING_KIND_LABELS: Record<ModerationFinding["kind"], string> = {
  low_quality: "recommendation.aiReview.findingKinds.lowQuality",
  conflict: "recommendation.aiReview.findingKinds.conflict",
  spam: "recommendation.aiReview.findingKinds.spam",
  test_content: "recommendation.aiReview.findingKinds.testContent",
  policy: "recommendation.aiReview.findingKinds.policy",
  duplicate: "recommendation.aiReview.findingKinds.duplicate",
  manual_review: "recommendation.aiReview.findingKinds.manualReview",
};

const SEVERITY_LABELS: Record<ModerationFinding["severity"], string> = {
  low: "recommendation.aiReview.severity.low",
  medium: "recommendation.aiReview.severity.medium",
  high: "recommendation.aiReview.severity.high",
};

const PHOTO_STATUS_LABELS: Record<PhotoAssessment["status"], string> = {
  appears_relevant: "recommendation.aiReview.photoStatuses.appearsRelevant",
  possible_conflict: "recommendation.aiReview.photoStatuses.possibleConflict",
  unclear: "recommendation.aiReview.photoStatuses.unclear",
  could_not_analyse: "recommendation.aiReview.photoStatuses.couldNotAnalyse",
};

const FIELD_TARGETS: Partial<Record<RecommendationEvidenceField, string>> = {
  vendor_name: "recommendation-field-vendor-name",
  description: "recommendation-field-description",
  why_recommend: "recommendation-field-why-recommend",
  category: "recommendation-field-category",
  location: "recommendation-field-location",
  contact: "recommendation-field-contact",
  photos: "recommendation-field-photos",
  image_attestation: "recommendation-field-photos",
  links: "recommendation-field-contact",
};

function scrollToEvidence(field: RecommendationEvidenceField) {
  const targetId = FIELD_TARGETS[field];
  if (!targetId) return;
  document.getElementById(targetId)
    ?.scrollIntoView({ behavior: "smooth", block: "center" });
}

function issueKey(field: RecommendationEvidenceField, message: string) {
  return JSON.stringify([field, message]);
}

function EvidenceIssue({
  field,
  children,
}: {
  field: RecommendationEvidenceField;
  children: ReactNode;
}) {
  const targetId = FIELD_TARGETS[field];
  return targetId ? (
    <button
      type="button"
      onClick={() => scrollToEvidence(field)}
      className="block w-full text-left"
    >
      {children}
    </button>
  ) : (
    <div className="block w-full text-left">
      {children}
    </div>
  );
}

export function RecommendationAiReviewPanel({
  recommendationId,
  onUseReason,
}: RecommendationAiReviewPanelProps) {
  const { t } = useTranslation("admin");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ModerationAssessment | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function runReview() {
    if (loading) return;
    setLoading(true);
    setResult(null);
    setError(null);
    try {
      const response = await fetch("/api/admin-ai/moderation-review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ recommendationId }),
      });
      const body = (await response.json()) as {
        data: ModerationAssessment | null;
        error: { message: string } | null;
      };
      if (!response.ok || !body.data) {
        setResult(null);
        setError(body.error?.message ?? t("recommendation.aiReview.errors.unavailable"));
        return;
      }
      setResult(body.data);
    } catch {
      setResult(null);
      setError(t("recommendation.aiReview.errors.unavailable"));
    } finally {
      setLoading(false);
    }
  }

  const failedChecks = result?.evidenceChecks.filter((check) => check.status !== "passed") ?? [];
  const passedChecks = result?.evidenceChecks.filter((check) => check.status === "passed") ?? [];
  const photoAssessments = result?.photoAssessments ?? [];
  const photoIssues = photoAssessments.filter((photo) => photo.status !== "appears_relevant");
  const issueCount = result ? new Set([
    ...failedChecks.map((check) => issueKey(check.field, check.message)),
    ...result.findings.map((finding) => issueKey(finding.field, finding.message)),
    ...photoIssues.map((photo) => issueKey("photos", photo.message)),
  ]).size : 0;
  const actionLabel = result?.suggestedAction === "request_changes"
    ? t("recommendation.aiReview.actions.requestChanges")
    : result?.suggestedAction === "reject"
      ? t("recommendation.aiReview.actions.reject")
      : result?.suggestedAction === "approve"
        ? t("recommendation.aiReview.actions.approve")
        : null;
  const canUseReason = (
    result?.suggestedAction === "request_changes"
    || result?.suggestedAction === "reject"
  ) && (result.feedbackDraft?.trim().length ?? 0) >= 10;

  return (
    <div>
      <Button size="sm" variant="outline" onClick={runReview} disabled={loading} className="gap-1.5">
        <Sparkles size={13} /> {loading ? t("recommendation.aiReview.reviewing") : t("recommendation.aiReview.review")}
      </Button>
      {error && <p role="alert" aria-live="polite" className="mt-2 text-xs text-destructive">{error}</p>}
      {result && (
        <div className="mt-3 space-y-3 rounded-xl bg-muted p-4 text-xs">
          <p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
            {t("recommendation.aiReview.advisory")}
          </p>

          {result.aiAvailable && result.suggestedAction ? (
            <section aria-label={t("recommendation.aiReview.suggestedDecision")}>
              <p className="text-[10px] font-semibold uppercase text-muted-foreground">{t("recommendation.aiReview.suggestedDecision")}</p>
              <div className="mt-1 flex items-center justify-between gap-2">
                <div>
                  <p className="text-base font-bold text-foreground">{actionLabel}</p>
                  <p aria-label={t("recommendation.aiReview.uniqueIssueCount")} className="mt-1 text-[11px] font-semibold text-muted-foreground">
                    {t(issueCount === 1 ? "recommendation.aiReview.uniqueIssue" : "recommendation.aiReview.uniqueIssues", { count: issueCount })}
                  </p>
                </div>
                <span className="rounded-full bg-background px-2 py-1 font-semibold">
                  {t("recommendation.aiReview.confidence", { value: result.confidence })}
                </span>
              </div>
            </section>
          ) : (
            <p className="rounded-lg bg-background p-3 text-muted-foreground">
              {t("recommendation.aiReview.analysisUnavailable")}
            </p>
          )}

          <section aria-label={t("recommendation.aiReview.needsAttention")} className="rounded-lg bg-background p-3">
            <p className="font-bold text-foreground">{t("recommendation.aiReview.needsAttention")}</p>
            {failedChecks.length === 0 && result.findings.length === 0 && photoIssues.length === 0 ? (
              <p className="mt-2 text-muted-foreground">{t("recommendation.aiReview.noIssues")}</p>
            ) : (
              <div className="mt-2 space-y-2">
                {failedChecks.map((check) => (
                  <EvidenceIssue key={`check-${check.field}`} field={check.field}>
                    <span className="font-semibold">{check.label}: </span>{check.message}
                  </EvidenceIssue>
                ))}
                {result.findings.map((finding, index) => (
                  <EvidenceIssue key={`finding-${finding.field}-${index}`} field={finding.field}>
                    <span className="block">
                      <span className="font-semibold">{t(FIELD_LABELS[finding.field])}</span>
                      <span className="text-muted-foreground"> {t("strictMigration.recommendationFindingMeta", {
                        kindLabel: t("recommendation.aiReview.kind"),
                        kind: t(FINDING_KIND_LABELS[finding.kind]),
                        severityLabel: t("recommendation.aiReview.severityLabel"),
                        severity: t(SEVERITY_LABELS[finding.severity]),
                      })}</span>
                    </span>
                    <span className="mt-1 block">{finding.message}</span>
                    {finding.evidenceSummary && (
                      <span className="mt-1 block text-muted-foreground">{t("strictMigration.recommendationEvidence", { label: t("recommendation.aiReview.evidence"), evidence: finding.evidenceSummary })}</span>
                    )}
                  </EvidenceIssue>
                ))}
                {photoIssues.length > 0 && (
                  <p className="text-muted-foreground">{t("recommendation.aiReview.photoAttention")}</p>
                )}
              </div>
            )}
            {photoAssessments.length > 0 && (
              <section aria-label={t("recommendation.aiReview.photoAssessments")} className="mt-3 rounded-lg bg-muted/50 p-3">
                <p className="font-semibold text-foreground">{t("recommendation.aiReview.photoAssessments")}</p>
                <div className="mt-2 space-y-2">
                  {photoAssessments.map((photo, index) => (
                    <EvidenceIssue key={`photo-assessment-${photo.imageId}-${index}`} field="photos">
                      <span className="block font-semibold">
                        {t("strictMigration.recommendationPhotoStatus", { photo: t("recommendation.aiReview.photoLabel", { number: index + 1 }), status: t(PHOTO_STATUS_LABELS[photo.status]) })}
                      </span>
                      <span className="mt-1 block">{photo.message}</span>
                    </EvidenceIssue>
                  ))}
                </div>
              </section>
            )}
          </section>

          <section aria-label={t("recommendation.aiReview.passedChecks")} className="rounded-lg bg-emerald-50 p-3 text-emerald-800">
            <p className="font-bold">{t("recommendation.aiReview.passedChecks")}</p>
            <ul className="mt-2 space-y-1">
              {passedChecks.map((check) => <li key={`passed-${check.field}`}>✓ {check.message}</li>)}
            </ul>
          </section>

          <p className="rounded-lg bg-background p-3 font-semibold">
            {t(result.duplicateCount === 1 ? "recommendation.aiReview.duplicateMatch" : "recommendation.aiReview.duplicateMatches", { count: result.duplicateCount })}
          </p>

          {result.feedbackDraft && (
            <section aria-label={t("recommendation.aiReview.suggestedFeedback")} className="rounded-lg bg-background p-3">
              <p className="font-bold text-foreground">{t("recommendation.aiReview.suggestedFeedback")}</p>
              <p className="mt-2 whitespace-pre-wrap text-muted-foreground">{result.feedbackDraft}</p>
              {canUseReason && (
                <Button
                  size="sm"
                  className="mt-3 w-full"
                  onClick={() => onUseReason(result.suggestedAction as ReasonAction, result.feedbackDraft!.trim())}
                >
                  {t("recommendation.aiReview.useReason")}
                </Button>
              )}
            </section>
          )}
        </div>
      )}
    </div>
  );
}
