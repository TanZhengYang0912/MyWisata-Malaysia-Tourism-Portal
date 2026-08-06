"use client";

import { useState } from "react";
import { Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import type {
  ModerationAssessment,
  RecommendationEvidenceField,
} from "@/lib/admin-ai/moderation";

type ReasonAction = "request_changes" | "reject";

interface RecommendationAiReviewPanelProps {
  recommendationId: string;
  onUseReason: (action: ReasonAction, reason: string) => void;
}

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
  const photoIssues = result?.photoAssessments.filter((photo) => photo.status !== "appears_relevant") ?? [];
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
                <p className="text-base font-bold text-foreground">{actionLabel}</p>
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
                  <button
                    key={`check-${check.field}`}
                    type="button"
                    onClick={() => scrollToEvidence(check.field)}
                    className="block w-full text-left"
                  >
                    <span className="font-semibold">{check.label}: </span>{check.message}
                  </button>
                ))}
                {result.findings.map((finding, index) => (
                  <button
                    key={`finding-${finding.field}-${index}`}
                    type="button"
                    onClick={() => scrollToEvidence(finding.field)}
                    className="block w-full text-left"
                  >
                    <span className="font-semibold">{finding.field}: </span>{finding.message}
                  </button>
                ))}
                {photoIssues.map((photo) => (
                  <button
                    key={`photo-${photo.imageId}`}
                    type="button"
                    onClick={() => scrollToEvidence("photos")}
                    className="block w-full text-left"
                  >
                    <span className="font-semibold">Photo: </span>{photo.message}
                  </button>
                ))}
              </div>
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
