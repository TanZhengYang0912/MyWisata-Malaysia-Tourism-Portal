"use client";

import { useState, type ReactNode } from "react";
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
  vendor_name: "Business name",
  description: "Description",
  why_recommend: "Recommendation reason",
  category: "Category",
  location: "Google location",
  contact: "Contact method",
  photos: "Photos",
  image_attestation: "Image rights",
  duplicate: "Exact name matches",
};

const FINDING_KIND_LABELS: Record<ModerationFinding["kind"], string> = {
  low_quality: "Low quality",
  conflict: "Conflict",
  spam: "Spam",
  test_content: "Test content",
  policy: "Policy",
  duplicate: "Duplicate",
  manual_review: "Manual review",
};

const SEVERITY_LABELS: Record<ModerationFinding["severity"], string> = {
  low: "Low",
  medium: "Medium",
  high: "High",
};

const PHOTO_STATUS_LABELS: Record<PhotoAssessment["status"], string> = {
  appears_relevant: "Appears relevant",
  possible_conflict: "Possible conflict",
  unclear: "Unclear",
  could_not_analyse: "Could not analyse",
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
        setError(body.error?.message ?? "AI review unavailable right now.");
        return;
      }
      setResult(body.data);
    } catch {
      setResult(null);
      setError("AI review unavailable right now.");
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
    ? "Request changes"
    : result?.suggestedAction === "reject"
      ? "Reject"
      : result?.suggestedAction === "approve"
        ? "Approve"
        : null;
  const canUseReason = (
    result?.suggestedAction === "request_changes"
    || result?.suggestedAction === "reject"
  ) && (result.feedbackDraft?.trim().length ?? 0) >= 10;

  return (
    <div>
      <Button size="sm" variant="outline" onClick={runReview} disabled={loading} className="gap-1.5">
        <Sparkles size={13} /> {loading ? "Reviewing…" : "AI review"}
      </Button>
      {error && <p role="alert" aria-live="polite" className="mt-2 text-xs text-destructive">{error}</p>}
      {result && (
        <div className="mt-3 space-y-3 rounded-xl bg-muted p-4 text-xs">
          <p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
            Advisory only — administrator confirmation required
          </p>

          {result.aiAvailable && result.suggestedAction ? (
            <section aria-label="Suggested decision">
              <p className="text-[10px] font-semibold uppercase text-muted-foreground">Suggested decision</p>
              <div className="mt-1 flex items-center justify-between gap-2">
                <div>
                  <p className="text-base font-bold text-foreground">{actionLabel}</p>
                  <p aria-label="Unique issue count" className="mt-1 text-[11px] font-semibold text-muted-foreground">
                    {issueCount} unique {issueCount === 1 ? "issue" : "issues"}
                  </p>
                </div>
                <span className="rounded-full bg-background px-2 py-1 font-semibold">
                  {result.confidence} confidence
                </span>
              </div>
            </section>
          ) : (
            <p className="rounded-lg bg-background p-3 text-muted-foreground">
              AI analysis unavailable. Deterministic evidence checks are still shown below.
            </p>
          )}

          <section aria-label="Needs attention" className="rounded-lg bg-background p-3">
            <p className="font-bold text-foreground">Needs attention</p>
            {failedChecks.length === 0 && result.findings.length === 0 && photoIssues.length === 0 ? (
              <p className="mt-2 text-muted-foreground">No issues identified.</p>
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
                      <span className="font-semibold">{FIELD_LABELS[finding.field]}</span>
                      <span className="text-muted-foreground">
                        {" · Kind: "}{FINDING_KIND_LABELS[finding.kind]}
                        {" · Severity: "}{SEVERITY_LABELS[finding.severity]}
                      </span>
                    </span>
                    <span className="mt-1 block">{finding.message}</span>
                    {finding.evidenceSummary && (
                      <span className="mt-1 block text-muted-foreground">Evidence: {finding.evidenceSummary}</span>
                    )}
                  </EvidenceIssue>
                ))}
                {photoIssues.length > 0 && (
                  <p className="text-muted-foreground">Photo assessments requiring attention are shown below.</p>
                )}
              </div>
            )}
            {photoAssessments.length > 0 && (
              <section aria-label="Photo assessments" className="mt-3 rounded-lg bg-muted/50 p-3">
                <p className="font-semibold text-foreground">Photo assessments</p>
                <div className="mt-2 space-y-2">
                  {photoAssessments.map((photo, index) => (
                    <EvidenceIssue key={`photo-assessment-${photo.imageId}-${index}`} field="photos">
                      <span className="block font-semibold">
                        Photo {index + 1} · {PHOTO_STATUS_LABELS[photo.status]}
                      </span>
                      <span className="mt-1 block">{photo.message}</span>
                    </EvidenceIssue>
                  ))}
                </div>
              </section>
            )}
          </section>

          <section aria-label="Passed checks" className="rounded-lg bg-emerald-50 p-3 text-emerald-800">
            <p className="font-bold">Passed checks</p>
            <ul className="mt-2 space-y-1">
              {passedChecks.map((check) => <li key={`passed-${check.field}`}>✓ {check.message}</li>)}
            </ul>
          </section>

          <p className="rounded-lg bg-background p-3 font-semibold">
            {result.duplicateCount} exact normalized-name {result.duplicateCount === 1 ? "match" : "matches"}
          </p>

          {result.feedbackDraft && (
            <section aria-label="Suggested feedback" className="rounded-lg bg-background p-3">
              <p className="font-bold text-foreground">Suggested feedback</p>
              <p className="mt-2 whitespace-pre-wrap text-muted-foreground">{result.feedbackDraft}</p>
              {canUseReason && (
                <Button
                  size="sm"
                  className="mt-3 w-full"
                  onClick={() => onUseReason(result.suggestedAction as ReasonAction, result.feedbackDraft!.trim())}
                >
                  Use this reason
                </Button>
              )}
            </section>
          )}
        </div>
      )}
    </div>
  );
}
