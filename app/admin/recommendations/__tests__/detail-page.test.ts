import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('admin recommendation detail workflow', () => {
  it('routes both queues to one detail page and keeps batch review actions on the list', () => {
    const source = readFileSync('app/admin/recommendations/page.tsx', 'utf8');

    expect(source).toContain('/admin/recommendations/${r.id}');
    expect(source).toContain('View details');
    expect(source).not.toContain('ApproveRejectBar');
    expect(source).toContain('AdminBatchActionBar');
    expect(source).toContain('/api/admin/recommendations/review');
  });

  it('shows the complete evidence and keeps actions on the detail view', () => {
    const source = readFileSync('components/admin/recommendation-detail-view.tsx', 'utf8');

    expect(source).toContain('Why this place is recommended');
    expect(source).toContain('Contact methods');
    expect(source).toContain('Submission photos');
    expect(source).toContain('Review decision');
    expect(source).toContain('/api/admin/recommendations/review');
    expect(source).toContain('request_changes');
  });

  it('renders a decision-first AI review and hands off reasons without submitting', () => {
    const panel = readFileSync('components/admin/recommendation-ai-review-panel.tsx', 'utf8');
    const detail = readFileSync('components/admin/recommendation-detail-view.tsx', 'utf8');

    expect(panel).toContain('Suggested decision');
    expect(panel).toContain('Needs attention');
    expect(panel).toContain('Passed checks');
    expect(panel).toContain('exact normalized-name');
    expect(panel).toContain('Use this reason');
    expect(panel).toContain('onUseReason');
    expect(detail).toContain('handleAiReason');
    expect(detail).toContain('setAction(suggestedAction)');
    expect(detail).toContain('setReason(feedbackDraft)');
    expect(panel).not.toContain('/api/admin/recommendations/review');
  });

  it('renders every photo assessment and complete finding details with a deduplicated issue count', () => {
    const panel = readFileSync('components/admin/recommendation-ai-review-panel.tsx', 'utf8');

    expect(panel).toContain('Photo assessments');
    expect(panel).toContain('photoAssessments.map((photo, index)');
    expect(panel).toContain('Photo {index + 1}');
    expect(panel).toContain('PHOTO_STATUS_LABELS[photo.status]');
    expect(panel).toContain('{photo.message}');
    expect(panel).toContain('FIELD_LABELS[finding.field]');
    expect(panel).toContain('FINDING_KIND_LABELS[finding.kind]');
    expect(panel).toContain('SEVERITY_LABELS[finding.severity]');
    expect(panel).toContain('{finding.message}');
    expect(panel).toContain('{finding.evidenceSummary}');
    expect(panel).toContain('finding.evidenceSummary && (');
    expect(panel).toContain('Unique issue count');
    expect(panel).toContain('new Set(');
    expect(panel).toContain('issueKey(check.field, check.message)');
    expect(panel).toContain('issueKey(finding.field, finding.message)');
    expect(panel).toContain('issueKey("photos", photo.message)');
    expect(panel).toContain('failedChecks.map');
    expect(panel).toContain('result.findings.map');
    expect(panel).toContain('photoIssues.map');
  });

  it('only makes evidence rows buttons when a target exists', () => {
    const panel = readFileSync('components/admin/recommendation-ai-review-panel.tsx', 'utf8');
    const targetsStart = panel.indexOf('const FIELD_TARGETS');
    const targetsEnd = panel.indexOf('};', targetsStart);
    const targets = panel.slice(targetsStart, targetsEnd);

    expect(targetsStart).toBeGreaterThanOrEqual(0);
    expect(targetsEnd).toBeGreaterThan(targetsStart);
    expect(targets).not.toContain('duplicate');
    expect(panel).toContain('const targetId = FIELD_TARGETS[field];');
    expect(panel).toContain('return targetId ? (');
    expect(panel).toContain('onClick={() => scrollToEvidence(field)}');
    expect(panel).toContain(') : (');
    expect(panel).toContain('field={check.field}');
    expect(panel).toContain('field={finding.field}');
    expect(panel).toContain('field="photos"');
  });

  it('clears stale AI results on rerun and failed responses with an accessible error contract', () => {
    const panel = readFileSync('components/admin/recommendation-ai-review-panel.tsx', 'utf8');
    const reviewStart = panel.indexOf('async function runReview()');
    const fetchStart = panel.indexOf('const response = await fetch', reviewStart);

    expect(reviewStart).toBeGreaterThanOrEqual(0);
    expect(fetchStart).toBeGreaterThan(reviewStart);
    expect(panel.indexOf('setResult(null);', reviewStart)).toBeLessThan(fetchStart);
    expect(panel.match(/setResult\(null\);/g) ?? []).toHaveLength(3);
    expect(panel).toContain('if (!response.ok || !body.data) {\n        setResult(null);');
    expect(panel).toContain('} catch {\n      setResult(null);');
    expect(panel).toContain('{error && <p role="alert" aria-live="polite"');
  });

  it('keeps the AI reason handoff local and outside confirmation/submission handlers', () => {
    const detail = readFileSync('components/admin/recommendation-detail-view.tsx', 'utf8');
    const handlerStart = detail.indexOf('function handleAiReason(');
    const handlerEnd = detail.indexOf('\n  function continueWithReason', handlerStart);
    const handler = detail.slice(handlerStart, handlerEnd);

    expect(handlerStart).toBeGreaterThanOrEqual(0);
    expect(handlerEnd).toBeGreaterThan(handlerStart);
    expect(handler).toContain('setAction(suggestedAction)');
    expect(handler).toContain('setReason(feedbackDraft)');
    expect(handler).toContain('setConfirmOpen(false)');
    expect(handler).toContain('setError(null)');
    expect(handler).toContain('requestAnimationFrame');
    expect(handler).not.toContain('continueWithReason');
    expect(handler).not.toContain('submitReview');
    expect(handler).not.toContain('/api/admin/recommendations/review');
  });

  it('requires a useful reason for both rejection and requested changes', () => {
    const source = readFileSync('app/api/admin/recommendations/review/route.ts', 'utf8');

    expect(source).toContain("['reject', 'request_changes'].includes(action)");
    expect(source).toContain("reason.trim().length < 10");
  });
});
