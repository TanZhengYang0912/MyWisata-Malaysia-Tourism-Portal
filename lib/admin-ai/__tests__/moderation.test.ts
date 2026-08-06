import { describe, expect, it } from 'vitest';
import {
  applyDecisionGuardrails,
  buildEvidenceChecks,
  type AiModerationResult,
  type RecommendationEvidenceRow,
} from '@/lib/admin-ai/moderation';

const completeRow: RecommendationEvidenceRow = {
  id: 'rec-1',
  vendor_name: 'Kedai Kopi',
  vendor_name_normalized: 'kedai kopi',
  description: 'A meaningful description of the local business.',
  why_recommend: 'Friendly service and a distinctive local menu.',
  category_id: 'category-1',
  categories: { name: 'Food' },
  google_place_id: 'place-1',
  location_name: 'Kedai Kopi Damansara',
  formatted_address: '1 Jalan Example, Kuala Lumpur',
  latitude: 3.1,
  longitude: 101.6,
  contact_phone: null,
  contact_email: 'vendor@example.com',
  contact_website: null,
  image_attested_at: '2026-08-07T00:00:00Z',
  state: null,
};

describe('buildEvidenceChecks', () => {
  it('passes complete Google location evidence without requiring legacy state', () => {
    const checks = buildEvidenceChecks(completeRow, 1, 0);
    expect(checks.find((check) => check.field === 'location')?.status).toBe('passed');
    expect(checks.some((check) => String(check.field) === 'state')).toBe(false);
  });

  it('separates missing evidence from content quality findings', () => {
    const checks = buildEvidenceChecks(
      { ...completeRow, why_recommend: null, formatted_address: null },
      1,
      0,
    );
    expect(checks.find((check) => check.field === 'why_recommend')?.status).toBe('missing');
    expect(checks.find((check) => check.field === 'location')?.status).toBe('missing');
    expect(checks.find((check) => check.field === 'description')?.status).toBe('passed');
  });
});

describe('applyDecisionGuardrails', () => {
  const aiResult: AiModerationResult = {
    suggestedAction: 'reject',
    confidence: 'high',
    findings: [],
    feedbackDraft: 'Please provide better evidence.',
    photoAssessments: [],
  };

  it('downgrades an unsupported reject suggestion to request changes', () => {
    const checks = buildEvidenceChecks(completeRow, 1, 0);
    expect(applyDecisionGuardrails(aiResult, checks, 0).suggestedAction)
      .toBe('request_changes');
  });

  it('allows reject only with a high-severity reject basis', () => {
    const checks = buildEvidenceChecks(completeRow, 1, 0);
    const result = applyDecisionGuardrails({
      ...aiResult,
      findings: [{
        field: 'vendor_name',
        severity: 'high',
        kind: 'test_content',
        message: 'The name is clearly test content.',
        evidenceSummary: 'testing 567',
      }],
    }, checks, 0);
    expect(result.suggestedAction).toBe('reject');
  });

  it('keeps approve only when required evidence and findings are clear', () => {
    const checks = buildEvidenceChecks(completeRow, 1, 0);
    const result = applyDecisionGuardrails({
      ...aiResult,
      suggestedAction: 'approve',
      confidence: 'high',
      feedbackDraft: null,
    }, checks, 0);
    expect(result).toEqual({
      suggestedAction: 'approve',
      confidence: 'high',
      feedbackDraft: null,
    });
  });

  it('forces request changes when required evidence is missing', () => {
    const checks = buildEvidenceChecks({ ...completeRow, why_recommend: null }, 1, 0);
    const result = applyDecisionGuardrails({
      ...aiResult,
      suggestedAction: 'approve',
    }, checks, 0);
    expect(result.suggestedAction).toBe('request_changes');
  });

  it.each([
    [0, 'passed'],
    [1, 'needs_manual_review'],
    [3, 'needs_manual_review'],
  ] as const)('reports %i exact matches deterministically', (count, status) => {
    const checks = buildEvidenceChecks(completeRow, 1, count);
    expect(checks.find((check) => check.field === 'duplicate')).toEqual(
      expect.objectContaining({ status, message: expect.stringContaining(String(count)) }),
    );
  });

  it('accepts reject when two or more other exact-name matches form a high duplicate signal', () => {
    const checks = buildEvidenceChecks(completeRow, 1, 2);
    expect(applyDecisionGuardrails(aiResult, checks, 2).suggestedAction).toBe('reject');
  });
});
