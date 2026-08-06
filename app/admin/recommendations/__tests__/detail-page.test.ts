import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('admin recommendation detail workflow', () => {
  it('routes both queues to one detail page and keeps moderation off the list', () => {
    const source = readFileSync('app/admin/recommendations/page.tsx', 'utf8');

    expect(source).toContain('/admin/recommendations/${r.id}');
    expect(source).toContain('View details');
    expect(source).not.toContain('ApproveRejectBar');
    expect(source).not.toContain('/api/admin/recommendations/review');
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

  it('requires a useful reason for both rejection and requested changes', () => {
    const source = readFileSync('app/api/admin/recommendations/review/route.ts', 'utf8');

    expect(source).toContain("['reject', 'request_changes'].includes(action)");
    expect(source).toContain("reason.trim().length < 10");
  });
});
