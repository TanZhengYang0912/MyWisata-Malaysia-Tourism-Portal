import { afterEach, describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
const { callGeminiMock } = vi.hoisted(() => ({ callGeminiMock: vi.fn() }));
vi.mock('@/lib/admin-ai/gemini', () => ({ callGemini: callGeminiMock }));

import {
  applyDecisionGuardrails,
  aiResultSchema,
  buildEvidenceChecks,
  buildSafeSubmissionText,
  loadRecommendationImages,
  MAX_GEMINI_IMAGE_PAYLOAD_BYTES,
  MAX_RECOMMENDATION_PHOTO_BYTES,
  RECOMMENDATION_PHOTO_TIMEOUT_MS,
  reviewRecommendation,
  type AiModerationResult,
  type ModerationFinding,
  type RecommendationImageRow,
  type RecommendationEvidenceRow,
} from '@/lib/admin-ai/moderation';

const completeRow: RecommendationEvidenceRow = {
  id: 'rec-1',
  vendor_name: 'Kedai Kopi',
  vendor_name_normalized: 'kedai kopi',
  description: 'A meaningful description of the local business.',
  why_recommend: 'Friendly service and a distinctive local menu.',
  category_id: 'category-1',
  categories: { name: 'Food', is_active: true },
  google_place_id: 'place-1',
  location_name: 'Kedai Kopi Damansara',
  formatted_address: '1 Jalan Example, Kuala Lumpur',
  latitude: 3.1,
  longitude: 101.6,
  contact_phone: null,
  contact_email: 'vendor@example.com',
  contact_website: null,
  image_attested_at: '2026-08-07T00:00:00Z',
};

const validSchemaResult = {
  suggestedAction: 'approve' as const,
  confidence: 'high' as const,
  findings: [],
  feedbackDraft: null,
  photoAssessments: [],
};

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
  callGeminiMock.mockReset();
});

function makeReviewService(imageRows: RecommendationImageRow[], duplicateCount = 0) {
  const recommendationQuery = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockResolvedValue({ data: completeRow, error: null }),
  };
  const imageQuery = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    is: vi.fn().mockReturnThis(),
    order: vi.fn().mockResolvedValue({ data: imageRows, error: null }),
  };
  const duplicateQuery = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    neq: vi.fn(),
  };
  duplicateQuery.neq
    .mockReturnValueOnce(duplicateQuery)
    .mockResolvedValueOnce({ count: duplicateCount, error: null });
  const vendorFrom = vi.fn()
    .mockReturnValueOnce(recommendationQuery)
    .mockReturnValueOnce(duplicateQuery);
  const createSignedUrl = vi.fn().mockResolvedValue({
    data: { signedUrl: 'https://signed/photo' },
    error: null,
  });
  const service = {
    from: vi.fn((table: string) => table === 'recommendation_images' ? imageQuery : vendorFrom()),
    storage: { from: vi.fn(() => ({ createSignedUrl })) },
  } as unknown as SupabaseClient;
  return { service, createSignedUrl, recommendationQuery };
}

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

  it('does not pass whitespace-only category names or image attestations', () => {
    const checks = buildEvidenceChecks({
      ...completeRow,
      categories: { name: '   ' },
      image_attested_at: '   ',
    }, 1, 0);
    expect(checks.find((check) => check.field === 'category')?.status).toBe('missing');
    expect(checks.find((check) => check.field === 'image_attestation')?.status).toBe('missing');
  });

  it.each([
    ['inactive relation', { name: 'Food', is_active: false }],
    ['legacy relation', { name: 'Food' }],
  ] as const)('does not pass an %s category relation', (_label, category) => {
    const checks = buildEvidenceChecks({ ...completeRow, categories: category }, 1, 0);
    expect(checks.find((check) => check.field === 'category')?.status).toBe('missing');
  });

  it('passes an active category relation in object and array shapes', () => {
    expect(buildEvidenceChecks({
      ...completeRow,
      categories: { name: ' Food ', is_active: true },
    }, 1, 0).find((check) => check.field === 'category')?.status).toBe('passed');
    expect(buildEvidenceChecks({
      ...completeRow,
      categories: [{ name: 'Food', is_active: true }],
    }, 1, 0).find((check) => check.field === 'category')?.status).toBe('passed');
  });
});

it('selects category activity with the recommendation evidence', async () => {
  const { service, recommendationQuery } = makeReviewService([]);
  callGeminiMock.mockResolvedValue(JSON.stringify(validSchemaResult));

  await reviewRecommendation(service, 'rec-1');

  expect(recommendationQuery.select).toHaveBeenCalledWith(
    expect.stringContaining('categories(name,is_active)'),
  );
});

describe('aiResultSchema', () => {
  it('rejects unknown top-level and nested fields', () => {
    expect(aiResultSchema.safeParse({
      ...validSchemaResult,
      unexpected: true,
    }).success).toBe(false);
    expect(aiResultSchema.safeParse({
      ...validSchemaResult,
      findings: [{
        field: 'vendor_name',
        severity: 'low',
        kind: 'low_quality',
        message: 'The name is vague.',
        evidenceSummary: null,
        unexpected: true,
      }],
    }).success).toBe(false);
  });

  it('rejects findings and feedback that exceed their bounded lengths', () => {
    expect(aiResultSchema.safeParse({
      ...validSchemaResult,
      findings: [{
        field: 'vendor_name',
        severity: 'low',
        kind: 'low_quality',
        message: 'x'.repeat(301),
        evidenceSummary: null,
      }],
    }).success).toBe(false);
    expect(aiResultSchema.safeParse({
      ...validSchemaResult,
      feedbackDraft: 'x'.repeat(501),
    }).success).toBe(false);
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

  it('normalizes an unsupported duplicate-only reject suggestion to approve', () => {
    const checks = buildEvidenceChecks(completeRow, 1, 0);
    expect(applyDecisionGuardrails(aiResult, checks, 0)).toMatchObject({
      suggestedAction: 'approve',
      confidence: 'medium',
      feedbackDraft: null,
    });
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

  it('does not let an AI duplicate finding control the final action without deterministic matches', () => {
    const checks = buildEvidenceChecks(completeRow, 1, 0);
    const result = applyDecisionGuardrails({
      ...aiResult,
      findings: [{
        field: 'duplicate',
        severity: 'high',
        kind: 'duplicate',
        message: 'The name resembles another submission.',
        evidenceSummary: 'AI-only duplicate suspicion',
      }],
    }, checks, 0);
    expect(result).toMatchObject({
      suggestedAction: 'approve',
      confidence: 'medium',
      feedbackDraft: null,
    });
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
    ['missing', { why_recommend: null }],
    ['low quality', { why_recommend: 'Too short' }],
  ] as const)('forces request changes for %s evidence despite a high duplicate count', (_label, override) => {
    const checks = buildEvidenceChecks({ ...completeRow, ...override }, 1, 2);
    const result = applyDecisionGuardrails({
      ...aiResult,
      findings: [],
    }, checks, 2);
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

  it('aligns a downgraded reject with medium confidence and non-rejection feedback', () => {
    const result = applyDecisionGuardrails({
      ...aiResult,
      feedbackDraft: 'Reject this recommendation because it must be declined.',
    }, buildEvidenceChecks({ ...completeRow, why_recommend: null }, 1, 0), 0);

    expect(result).toMatchObject({
      suggestedAction: 'request_changes',
      confidence: 'medium',
    });
    expect(result.feedbackDraft).toBeTruthy();
    expect(result.feedbackDraft!.length).toBeGreaterThanOrEqual(10);
    expect(result.feedbackDraft!.length).toBeLessThanOrEqual(500);
    expect(result.feedbackDraft).not.toMatch(/reject|declin/i);
  });

  it('provides sanitized useful feedback for every non-approve action', () => {
    const result = applyDecisionGuardrails({
      ...aiResult,
      suggestedAction: 'request_changes',
      confidence: 'high',
      feedbackDraft: 'Email person@example.com; please provide more evidence.',
    }, buildEvidenceChecks({ ...completeRow, why_recommend: null }, 1, 0), 0);

    expect(result.feedbackDraft).toBeTruthy();
    expect(result.feedbackDraft!.length).toBeGreaterThanOrEqual(10);
    expect(result.feedbackDraft!.length).toBeLessThanOrEqual(500);
    expect(result.feedbackDraft).not.toContain('person@example.com');
    expect(applyDecisionGuardrails({
      ...aiResult,
      suggestedAction: 'approve',
      feedbackDraft: 'This draft must never be returned.',
    }, buildEvidenceChecks(completeRow, 1, 0), 0).feedbackDraft).toBeNull();
  });

  it.each([
    [0, [{
      field: 'vendor_name' as const,
      severity: 'high' as const,
      kind: 'test_content' as const,
      message: 'The name is clearly test content.',
      evidenceSummary: 'test content',
    }], /test content|rejection/i],
    [2, [], /exact normalized-name match|rejection/i],
  ] satisfies Array<[number, ModerationFinding[], RegExp]>)('aligns accepted reject feedback with its authoritative basis (%i)', (duplicateCount, findings, expected) => {
    const result = applyDecisionGuardrails({
      suggestedAction: 'reject',
      confidence: 'high',
      findings,
      feedbackDraft: 'Please provide more evidence before approval.',
      photoAssessments: [],
    }, buildEvidenceChecks(completeRow, 1, duplicateCount), duplicateCount);

    expect(result.suggestedAction).toBe('reject');
    expect(result.feedbackDraft).toMatch(expected);
    expect(result.feedbackDraft).not.toMatch(/provide more evidence|request changes|before approval/i);
  });

  it.each([
    'It looks like a duplicate.',
    'Please check for a duplicate listing.',
  ])('ignores duplicate wording when no structured basis remains: %s', (feedbackDraft) => {
    const result = applyDecisionGuardrails({
      suggestedAction: 'request_changes',
      confidence: 'high',
      findings: [],
      feedbackDraft,
      photoAssessments: [],
    }, buildEvidenceChecks(completeRow, 1, 0), 0);

    expect(result).toEqual({
      suggestedAction: 'approve',
      confidence: 'medium',
      feedbackDraft: null,
    });
  });

  it('retains a structured non-duplicate request basis with server-aligned feedback', () => {
    const result = applyDecisionGuardrails({
      suggestedAction: 'request_changes',
      confidence: 'high',
      findings: [
        {
          field: 'duplicate',
          severity: 'high',
          kind: 'duplicate',
          message: 'It looks like a duplicate.',
          evidenceSummary: null,
        },
        {
          field: 'description',
          severity: 'low',
          kind: 'low_quality',
          message: 'The description needs more detail.',
          evidenceSummary: null,
        },
      ],
      feedbackDraft: 'Please check for a duplicate listing.',
      photoAssessments: [],
    }, buildEvidenceChecks(completeRow, 1, 0), 0);

    expect(result.suggestedAction).toBe('request_changes');
    expect(result.feedbackDraft).toContain('submitted evidence');
    expect(result.feedbackDraft).not.toMatch(/duplicate/i);
  });

  it('caps confidence whenever guardrails override the model action', () => {
    const requestToApprove = applyDecisionGuardrails({
      suggestedAction: 'request_changes',
      confidence: 'high',
      findings: [],
      feedbackDraft: 'It looks like a duplicate.',
      photoAssessments: [],
    }, buildEvidenceChecks(completeRow, 1, 0), 0);
    const approveToRequest = applyDecisionGuardrails({
      suggestedAction: 'approve',
      confidence: 'high',
      findings: [],
      feedbackDraft: null,
      photoAssessments: [{
        imageId: '00000000-0000-4000-8000-000000000021',
        status: 'possible_conflict',
        message: 'The photo may conflict with the category.',
      }],
    }, buildEvidenceChecks(completeRow, 1, 0), 0);

    expect(requestToApprove).toMatchObject({ suggestedAction: 'approve', confidence: 'medium' });
    expect(approveToRequest).toMatchObject({ suggestedAction: 'request_changes', confidence: 'medium' });
  });
});

describe('deterministic duplicate findings', () => {
  it.each([0, 1, 3])('uses only the deterministic duplicate count (%i)', async (duplicateCount) => {
    const imageId = '00000000-0000-4000-8000-000000000013';
    const { service } = makeReviewService([{
      id: imageId,
      storage_path: 'private/duplicate-fixture.jpg',
      sort_order: 0,
    }], duplicateCount);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(new Uint8Array([1, 2, 3]), {
      status: 200,
      headers: { 'content-type': 'image/jpeg' },
    })));
    callGeminiMock.mockResolvedValue(JSON.stringify({
      ...validSchemaResult,
      findings: [{
        field: 'duplicate',
        severity: 'high',
        kind: 'duplicate',
        message: 'AI claims this matches another submission.',
        evidenceSummary: 'Model-authored duplicate evidence',
      }],
      photoAssessments: [{
        imageId,
        status: 'appears_relevant',
        message: 'The photo appears relevant.',
      }],
    }));

    const result = await reviewRecommendation(service, 'rec-1');
    const duplicateCheck = result.evidenceChecks.find((check) => check.field === 'duplicate');

    expect(result.findings.some((finding) => finding.field === 'duplicate' || finding.kind === 'duplicate'))
      .toBe(false);
    expect(result.duplicateCount).toBe(duplicateCount);
    expect(duplicateCheck?.message).toContain(`${duplicateCount} exact normalized-name match`);
    expect(duplicateCheck?.status).toBe(duplicateCount === 0 ? 'passed' : 'needs_manual_review');
    expect(result.suggestedAction).toBe(duplicateCount === 0 ? 'approve' : 'request_changes');
  });

  it.each([0, 1, 3])('ignores duplicate-only model action and feedback at count %i', async (duplicateCount) => {
    const imageId = '00000000-0000-4000-8000-000000000014';
    const { service } = makeReviewService([{
      id: imageId,
      storage_path: 'private/duplicate-only.jpg',
      sort_order: 0,
    }], duplicateCount);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(new Uint8Array([1, 2, 3]), {
      status: 200,
      headers: { 'content-type': 'image/jpeg' },
    })));
    callGeminiMock.mockResolvedValue(JSON.stringify({
      suggestedAction: 'request_changes',
      confidence: 'high',
      findings: [{
        field: 'duplicate',
        severity: 'high',
        kind: 'duplicate',
        message: 'This is a duplicate submission.',
        evidenceSummary: 'Duplicate-only model evidence',
      }],
      feedbackDraft: 'This is a duplicate submission.',
      photoAssessments: [{
        imageId,
        status: 'appears_relevant',
        message: 'The photo appears relevant.',
      }],
    }));

    const result = await reviewRecommendation(service, 'rec-1');

    expect(result.findings.some((finding) => finding.kind === 'duplicate' || finding.field === 'duplicate'))
      .toBe(false);
    if (duplicateCount === 0) {
      expect(result.suggestedAction).toBe('approve');
      expect(result.feedbackDraft).toBeNull();
    } else {
      expect(result.suggestedAction).toBe('request_changes');
      expect(result.feedbackDraft).toContain(`${duplicateCount} exact normalized-name match`);
      expect(result.feedbackDraft).not.toContain('duplicate submission');
    }
  });

  it('preserves non-duplicate findings and uses server-aligned feedback', async () => {
    const imageId = '00000000-0000-4000-8000-000000000015';
    const { service } = makeReviewService([{
      id: imageId,
      storage_path: 'private/mixed-feedback.jpg',
      sort_order: 0,
    }]);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(new Uint8Array([1, 2, 3]), {
      status: 200,
      headers: { 'content-type': 'image/jpeg' },
    })));
    callGeminiMock.mockResolvedValue(JSON.stringify({
      suggestedAction: 'request_changes',
      confidence: 'medium',
      findings: [
        {
          field: 'duplicate',
          severity: 'high',
          kind: 'duplicate',
          message: 'A duplicate may exist.',
          evidenceSummary: null,
        },
        {
          field: 'description',
          severity: 'low',
          kind: 'low_quality',
          message: 'The description needs more detail.',
          evidenceSummary: null,
        },
      ],
      feedbackDraft: 'This is a duplicate submission. Please provide a clearer description.',
      photoAssessments: [{
        imageId,
        status: 'appears_relevant',
        message: 'The photo appears relevant.',
      }],
    }));

    const result = await reviewRecommendation(service, 'rec-1');

    expect(result.suggestedAction).toBe('request_changes');
    expect(result.findings).toEqual(expect.arrayContaining([
      expect.objectContaining({ field: 'description', message: 'The description needs more detail.' }),
    ]));
    expect(result.findings.some((finding) => finding.kind === 'duplicate')).toBe(false);
    expect(result.feedbackDraft).toContain('submitted evidence');
    expect(result.feedbackDraft).not.toContain('duplicate');
  });
});

it('builds a complete safe summary without raw contact values or paths', () => {
  const safeText = buildSafeSubmissionText(completeRow, 2, 0);
  expect(safeText).toContain('Recommendation reason: Friendly service');
  expect(safeText).toContain('Category: Food');
  expect(safeText).toContain('Contact methods present: email');
  expect(safeText).toContain('Photo count: 2');
  expect(safeText).toContain('Exact normalized-name matches: 0');
  expect(safeText).not.toContain('vendor@example.com');
  expect(safeText).not.toContain('storage_path');
  expect(safeText).not.toContain('staged/');
});

it('continues when one transformed photo cannot be loaded', async () => {
  const createSignedUrl = vi.fn()
    .mockResolvedValueOnce({ data: { signedUrl: 'https://signed/one' }, error: null })
    .mockResolvedValueOnce({ data: { signedUrl: 'https://signed/two' }, error: null });
  const service = {
    storage: { from: vi.fn(() => ({ createSignedUrl })) },
  } as unknown as SupabaseClient;
  vi.stubGlobal('fetch', vi.fn()
    .mockResolvedValueOnce(new Response(new Uint8Array([1, 2, 3]), {
      status: 200,
      headers: { 'content-type': 'image/jpeg' },
    }))
    .mockResolvedValueOnce(new Response('unavailable', { status: 503 })));

  const result = await loadRecommendationImages(service, [
    { id: '00000000-0000-4000-8000-000000000001', storage_path: 'private/one.jpg', sort_order: 0 },
    { id: '00000000-0000-4000-8000-000000000002', storage_path: 'private/two.jpg', sort_order: 1 },
  ]);

  expect(result.images).toEqual([expect.objectContaining({
    id: '00000000-0000-4000-8000-000000000001',
    mimeType: 'image/jpeg',
  })]);
  expect(result.failures).toEqual(['00000000-0000-4000-8000-000000000002']);
});

describe('reviewRecommendation photo guardrails', () => {
  it('downgrades a reject when an active photo cannot be analysed', async () => {
    const imageId = '00000000-0000-4000-8000-000000000001';
    const { service } = makeReviewService([
      { id: imageId, storage_path: 'private/photo.jpg', sort_order: 0 },
    ]);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('unavailable', { status: 503 })));
    callGeminiMock.mockResolvedValue(JSON.stringify({
      suggestedAction: 'reject',
      confidence: 'high',
      findings: [{
        field: 'vendor_name',
        severity: 'high',
        kind: 'test_content',
        message: 'The submission is clearly test content.',
        evidenceSummary: 'test content',
      }],
      feedbackDraft: 'Please remove the test content.',
      photoAssessments: [],
    }));

    const result = await reviewRecommendation(service, 'rec-1');

    expect(result.suggestedAction).toBe('request_changes');
    expect(result.evidenceChecks.find((check) => check.field === 'photos')?.status)
      .toBe('needs_manual_review');
    expect(result.photoAssessments).toEqual([{
      imageId,
      status: 'could_not_analyse',
      message: 'This photo could not be analysed.',
    }]);
  });

  it('discards prohibited photo claims and forces manual review', async () => {
    const imageId = '00000000-0000-4000-8000-000000000002';
    const { service } = makeReviewService([
      { id: imageId, storage_path: 'private/photo.jpg', sort_order: 0 },
    ]);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(new Uint8Array([1, 2, 3]), {
      status: 200,
      headers: { 'content-type': 'image/jpeg' },
    })));
    callGeminiMock.mockResolvedValue(JSON.stringify({
      ...validSchemaResult,
      photoAssessments: [{
        imageId,
        status: 'appears_relevant',
        message: 'This proves authenticity, location, ownership, and publishing rights. storage_path/private/photo.jpg data:image/png;base64,QUJDREVGRw==',
      }],
    }));

    const result = await reviewRecommendation(service, 'rec-1');
    const photo = result.photoAssessments.find((assessment) => assessment.imageId === imageId);

    expect(result.suggestedAction).toBe('request_changes');
    expect(photo?.status).toBe('could_not_analyse');
    expect(photo?.message).toBe('Photo assessment omitted because it made a prohibited claim.');
    expect(photo?.message).not.toMatch(/authentic|location|ownership|rights|storage_path|base64/i);
  });

  it('replaces prohibited claims in photo findings and forces manual review', async () => {
    const imageId = '00000000-0000-4000-8000-000000000003';
    const { service } = makeReviewService([
      { id: imageId, storage_path: 'private/photo.jpg', sort_order: 0 },
    ]);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(new Uint8Array([1, 2, 3]), {
      status: 200,
      headers: { 'content-type': 'image/jpeg' },
    })));
    callGeminiMock.mockResolvedValue(JSON.stringify({
      ...validSchemaResult,
      findings: [{
        field: 'photos',
        severity: 'low',
        kind: 'conflict',
        message: 'The photo proves authenticity and location ownership.',
        evidenceSummary: 'It confirms the publishing rights.',
      }],
      photoAssessments: [{
        imageId,
        status: 'appears_relevant',
        message: 'The photo appears relevant.',
      }],
    }));

    const result = await reviewRecommendation(service, 'rec-1');
    const finding = result.findings.find((candidate) => candidate.field === 'photos');

    expect(result.suggestedAction).toBe('request_changes');
    expect(finding).toEqual(expect.objectContaining({
      kind: 'manual_review',
      message: 'Photo review requires manual review.',
      evidenceSummary: null,
    }));
  });

  it('drops prohibited claims in feedback drafts and forces manual review', async () => {
    const imageId = '00000000-0000-4000-8000-000000000004';
    const { service } = makeReviewService([
      { id: imageId, storage_path: 'private/photo.jpg', sort_order: 0 },
    ]);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(new Uint8Array([1, 2, 3]), {
      status: 200,
      headers: { 'content-type': 'image/jpeg' },
    })));
    callGeminiMock.mockResolvedValue(JSON.stringify({
      ...validSchemaResult,
      feedbackDraft: 'The submitted photo proves authenticity, location, ownership, and rights.',
      photoAssessments: [{
        imageId,
        status: 'appears_relevant',
        message: 'The photo appears relevant.',
      }],
    }));

    const result = await reviewRecommendation(service, 'rec-1');

    expect(result.suggestedAction).toBe('request_changes');
    expect(result.feedbackDraft).toBeTruthy();
    expect(result.feedbackDraft!.length).toBeGreaterThanOrEqual(10);
    expect(result.findings).toEqual(expect.arrayContaining([{
      field: 'photos',
      severity: 'medium',
      kind: 'manual_review',
      message: 'Photo review requires manual review.',
      evidenceSummary: null,
    }]));
  });

  it('uses server-aligned feedback for a legitimate non-photo request basis', async () => {
    const imageId = '00000000-0000-4000-8000-000000000005';
    const { service } = makeReviewService([
      { id: imageId, storage_path: 'private/photo.jpg', sort_order: 0 },
    ]);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(new Uint8Array([1, 2, 3]), {
      status: 200,
      headers: { 'content-type': 'image/jpeg' },
    })));
    callGeminiMock.mockResolvedValue(JSON.stringify({
      ...validSchemaResult,
      suggestedAction: 'request_changes',
      confidence: 'medium',
      findings: [{
        field: 'description',
        severity: 'low',
        kind: 'low_quality',
        message: 'The description needs more detail.',
        evidenceSummary: null,
      }],
      feedbackDraft: 'Please provide a clearer description and recommendation reason.',
      photoAssessments: [{
        imageId,
        status: 'appears_relevant',
        message: 'The photo appears relevant.',
      }],
    }));

    const result = await reviewRecommendation(service, 'rec-1');

    expect(result.suggestedAction).toBe('request_changes');
    expect(result.feedbackDraft).toBe('Please review the submitted evidence and provide any missing details before approval.');
  });

  it('reports overflow active photos, sends at most five images, and filters invented IDs', async () => {
    const imageRows = Array.from({ length: 7 }, (_, index) => ({
      id: `00000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`,
      storage_path: `private/photo-${index + 1}.jpg`,
      sort_order: index,
    }));
    const inventedId = '00000000-0000-4000-8000-000000009999';
    const { service, createSignedUrl } = makeReviewService(imageRows);
    const fetchMock = vi.fn().mockImplementation(() => Promise.resolve(new Response(new Uint8Array([1, 2, 3]), {
      status: 200,
      headers: { 'content-type': 'image/jpeg' },
    })));
    vi.stubGlobal('fetch', fetchMock);
    callGeminiMock.mockResolvedValue(JSON.stringify({
      ...validSchemaResult,
      photoAssessments: [
        {
          imageId: imageRows[0].id,
          status: 'appears_relevant',
          message: 'The photo appears relevant.',
        },
        {
          imageId: inventedId,
          status: 'possible_conflict',
          message: 'Invented photo assessment.',
        },
      ],
    }));

    const result = await reviewRecommendation(service, 'rec-1');
    const geminiOptions = callGeminiMock.mock.calls[0]?.[2] as { images: unknown[] };

    expect(createSignedUrl).toHaveBeenCalledTimes(5);
    expect(fetchMock).toHaveBeenCalledTimes(5);
    expect(geminiOptions.images).toHaveLength(5);
    expect(result.suggestedAction).toBe('request_changes');
    expect(result.photoAssessments).toEqual(expect.arrayContaining(imageRows.slice(5).map((row) => ({
      imageId: row.id,
      status: 'could_not_analyse',
      message: 'This photo could not be analysed.',
    }))));
    expect(result.photoAssessments.some((assessment) => assessment.imageId === inventedId)).toBe(false);
  });

  it('screens every model prose channel while allowing benign relevance wording', async () => {
    const unsafeImageId = '00000000-0000-4000-8000-000000000006';
    const relevantImageId = '00000000-0000-4000-8000-000000000007';
    const { service } = makeReviewService([
      { id: unsafeImageId, storage_path: 'private/unsafe.jpg', sort_order: 0 },
      { id: relevantImageId, storage_path: 'private/relevant.jpg', sort_order: 1 },
    ]);
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce(new Response(new Uint8Array([1, 2, 3]), {
        status: 200,
        headers: { 'content-type': 'image/jpeg' },
      }))
      .mockResolvedValueOnce(new Response(new Uint8Array([4, 5, 6]), {
        status: 200,
        headers: { 'content-type': 'image/jpeg' },
      })));
    callGeminiMock.mockResolvedValue(JSON.stringify({
      ...validSchemaResult,
      findings: [
        {
          field: 'vendor_name',
          severity: 'low',
          kind: 'low_quality',
          message: 'The photo proves ownership.',
          evidenceSummary: null,
        },
        {
          field: 'description',
          severity: 'low',
          kind: 'low_quality',
          message: 'The description is clear.',
          evidenceSummary: 'The image confirms the listed location.',
        },
      ],
      feedbackDraft: 'The submitted image proves authenticity.',
      photoAssessments: [
        {
          imageId: unsafeImageId,
          status: 'appears_relevant',
          message: 'This photo proves authenticity.',
        },
        {
          imageId: relevantImageId,
          status: 'appears_relevant',
          message: 'The photo appears relevant to the listed place/location.',
        },
      ],
    }));

    const result = await reviewRecommendation(service, 'rec-1');

    expect(result.suggestedAction).toBe('request_changes');
    expect(result.confidence).toBe('medium');
    expect(result.findings.filter((finding) => finding.kind === 'manual_review')).toHaveLength(1);
    expect(result.findings).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ message: expect.stringMatching(/proves|confirms|authenticity|ownership/i) }),
    ]));
    expect(result.feedbackDraft).toBeTruthy();
    expect(result.feedbackDraft).not.toMatch(/proves|confirms|authenticity|ownership|reject|declin/i);
    expect(result.photoAssessments).toEqual(expect.arrayContaining([
      {
        imageId: unsafeImageId,
        status: 'could_not_analyse',
        message: 'Photo assessment omitted because it made a prohibited claim.',
      },
      {
        imageId: relevantImageId,
        status: 'appears_relevant',
        message: 'The photo appears relevant to the listed place/location.',
      },
    ]));
  });

  it('screens explicit photo location claims but preserves submitted-address prose', async () => {
    const imageId = '00000000-0000-4000-8000-000000000016';
    const { service } = makeReviewService([
      { id: imageId, storage_path: 'private/location-claim.jpg', sort_order: 0 },
    ]);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(new Uint8Array([1, 2, 3]), {
      status: 200,
      headers: { 'content-type': 'image/jpeg' },
    })));
    callGeminiMock.mockResolvedValue(JSON.stringify({
      suggestedAction: 'approve',
      confidence: 'high',
      findings: [
        {
          field: 'vendor_name',
          severity: 'low',
          kind: 'low_quality',
          message: 'The photo was taken at the listed location.',
          evidenceSummary: null,
        },
        {
          field: 'location',
          severity: 'low',
          kind: 'low_quality',
          message: 'The submitted address confirms the location.',
          evidenceSummary: null,
        },
      ],
      feedbackDraft: null,
      photoAssessments: [{
        imageId,
        status: 'appears_relevant',
        message: 'The photo appears relevant.',
      }],
    }));

    const result = await reviewRecommendation(service, 'rec-1');

    expect(result.suggestedAction).toBe('request_changes');
    expect(result.findings).toEqual(expect.arrayContaining([
      expect.objectContaining({
        field: 'photos',
        kind: 'manual_review',
        message: 'Photo review requires manual review.',
      }),
      expect.objectContaining({
        field: 'location',
        message: 'The submitted address confirms the location.',
      }),
    ]));
    expect(result.findings).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ message: 'The photo was taken at the listed location.' }),
    ]));
  });

  it('uses structured photo channels for implicit photo location claims', async () => {
    const imageId = '00000000-0000-4000-8000-000000000021';
    const implicitClaim = 'It was taken at the listed location.';
    const { service } = makeReviewService([
      { id: imageId, storage_path: 'private/implicit-location-claim.jpg', sort_order: 0 },
    ], 1);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(new Uint8Array([1, 2, 3]), {
      status: 200,
      headers: { 'content-type': 'image/jpeg' },
    })));
    callGeminiMock.mockResolvedValue(JSON.stringify({
      ...validSchemaResult,
      findings: [
        {
          field: 'photos',
          severity: 'low',
          kind: 'low_quality',
          message: implicitClaim,
          evidenceSummary: null,
        },
        {
          field: 'location',
          severity: 'low',
          kind: 'low_quality',
          message: implicitClaim,
          evidenceSummary: null,
        },
      ],
      feedbackDraft: implicitClaim,
      photoAssessments: [{
        imageId,
        status: 'appears_relevant',
        message: implicitClaim,
      }],
    }));

    const result = await reviewRecommendation(service, 'rec-1');

    expect(result.suggestedAction).toBe('request_changes');
    expect(result.findings).toEqual(expect.arrayContaining([
      expect.objectContaining({
        field: 'photos',
        kind: 'manual_review',
        message: 'Photo review requires manual review.',
      }),
      expect.objectContaining({ field: 'location', message: implicitClaim }),
    ]));
    expect(result.findings).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ field: 'photos', message: implicitClaim }),
    ]));
    expect(result.feedbackDraft).toBe(implicitClaim);
    expect(result.photoAssessments).toEqual([{
      imageId,
      status: 'could_not_analyse',
      message: 'Photo assessment omitted because it made a prohibited claim.',
    }]);
  });

  it('returns photo assessments in active order with failed and omitted IDs filled in place', async () => {
    const imageRows = [
      { id: '00000000-0000-4000-8000-000000000017', storage_path: 'private/failed.jpg', sort_order: 0 },
      { id: '00000000-0000-4000-8000-000000000018', storage_path: 'private/second.jpg', sort_order: 1 },
      { id: '00000000-0000-4000-8000-000000000019', storage_path: 'private/omitted.jpg', sort_order: 2 },
      { id: '00000000-0000-4000-8000-000000000020', storage_path: 'private/fourth.jpg', sort_order: 3 },
    ];
    const { service } = makeReviewService(imageRows);
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce(new Response('unavailable', { status: 503 }))
      .mockImplementation(() => Promise.resolve(new Response(new Uint8Array([1, 2, 3]), {
          status: 200,
          headers: { 'content-type': 'image/jpeg' },
        }))));
    callGeminiMock.mockResolvedValue(JSON.stringify({
      ...validSchemaResult,
      photoAssessments: [
        {
          imageId: imageRows[3].id,
          status: 'appears_relevant',
          message: 'The photo appears relevant.',
        },
        {
          imageId: imageRows[1].id,
          status: 'appears_relevant',
          message: 'The photo appears relevant.',
        },
      ],
    }));

    const result = await reviewRecommendation(service, 'rec-1');

    expect(result.photoAssessments).toEqual([
      {
        imageId: imageRows[0].id,
        status: 'could_not_analyse',
        message: 'This photo could not be analysed.',
      },
      {
        imageId: imageRows[1].id,
        status: 'appears_relevant',
        message: 'The photo appears relevant.',
      },
      {
        imageId: imageRows[2].id,
        status: 'could_not_analyse',
        message: 'This photo could not be analysed.',
      },
      {
        imageId: imageRows[3].id,
        status: 'appears_relevant',
        message: 'The photo appears relevant.',
      },
    ]);
  });

  it('returns every active photo in order when Gemini output is malformed after a later photo failure', async () => {
    const imageRows = [
      { id: '00000000-0000-4000-8000-000000000022', storage_path: 'private/first.jpg', sort_order: 0 },
      { id: '00000000-0000-4000-8000-000000000023', storage_path: 'private/second.jpg', sort_order: 1 },
      { id: '00000000-0000-4000-8000-000000000024', storage_path: 'private/later-failure.jpg', sort_order: 2 },
    ];
    const { service } = makeReviewService(imageRows);
    vi.stubGlobal('fetch', vi.fn()
      .mockImplementationOnce(() => Promise.resolve(new Response(new Uint8Array([1, 2, 3]), {
        status: 200,
        headers: { 'content-type': 'image/jpeg' },
      })))
      .mockImplementationOnce(() => Promise.resolve(new Response(new Uint8Array([4, 5, 6]), {
        status: 200,
        headers: { 'content-type': 'image/jpeg' },
      })))
      .mockImplementationOnce(() => Promise.resolve(new Response('unavailable', { status: 503 }))));
    callGeminiMock.mockResolvedValue('{ malformed moderation output');

    const result = await reviewRecommendation(service, 'rec-1');

    expect(result.aiAvailable).toBe(false);
    expect(result.photoAssessments).toEqual(imageRows.map((row) => ({
      imageId: row.id,
      status: 'could_not_analyse',
      message: 'This photo could not be analysed.',
    })));
  });

  it('degrades an oversized photo without approving the recommendation', async () => {
    const imageId = '00000000-0000-4000-8000-000000000008';
    const { service } = makeReviewService([
      { id: imageId, storage_path: 'private/oversized.jpg', sort_order: 0 },
    ]);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(new Uint8Array([1]), {
      status: 200,
      headers: {
        'content-type': 'image/jpeg',
        'content-length': String(MAX_RECOMMENDATION_PHOTO_BYTES + 1),
      },
    })));
    callGeminiMock.mockResolvedValue(JSON.stringify(validSchemaResult));

    const result = await reviewRecommendation(service, 'rec-1');

    expect(result.suggestedAction).toBe('request_changes');
    expect(result.photoAssessments).toEqual([{
      imageId,
      status: 'could_not_analyse',
      message: 'This photo could not be analysed.',
    }]);
  });
});

describe('bounded recommendation photo loading', () => {
  it('times out a stalled photo fetch and aborts its request', async () => {
    vi.useFakeTimers();
    const imageId = '00000000-0000-4000-8000-000000000009';
    const createSignedUrl = vi.fn().mockResolvedValue({
      data: { signedUrl: 'https://signed/stalled' },
      error: null,
    });
    const service = {
      storage: { from: vi.fn(() => ({ createSignedUrl })) },
    } as unknown as SupabaseClient;
    const fetchMock = vi.fn().mockResolvedValue(new Response(new ReadableStream<Uint8Array>(), {
      status: 200,
      headers: { 'content-type': 'image/jpeg' },
    }));
    vi.stubGlobal('fetch', fetchMock);

    const loading = loadRecommendationImages(service, [{
      id: imageId,
      storage_path: 'private/stalled.jpg',
      sort_order: 0,
    }]);
    const completion = Promise.race([
      loading.then(() => 'complete' as const),
      new Promise<'guard'>(resolve => setTimeout(() => resolve('guard'), RECOMMENDATION_PHOTO_TIMEOUT_MS + 100)),
    ]);

    await vi.advanceTimersByTimeAsync(RECOMMENDATION_PHOTO_TIMEOUT_MS + 100);

    expect(await completion).toBe('complete');
    await expect(loading).resolves.toEqual({ images: [], failures: [imageId] });
    expect(fetchMock.mock.calls[0]?.[1]).toEqual(expect.objectContaining({
      signal: expect.any(AbortSignal),
    }));
  });

  it('enforces the streaming per-photo byte limit without buffering an oversized body', async () => {
    const imageId = '00000000-0000-4000-8000-000000000010';
    const service = {
      storage: { from: vi.fn(() => ({
        createSignedUrl: vi.fn().mockResolvedValue({
          data: { signedUrl: 'https://signed/streaming-oversize' },
          error: null,
        }),
      })) },
    } as unknown as SupabaseClient;
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array(MAX_RECOMMENDATION_PHOTO_BYTES + 1));
        controller.close();
      },
    }), {
      status: 200,
      headers: { 'content-type': 'image/jpeg' },
    })));

    await expect(loadRecommendationImages(service, [{
      id: imageId,
      storage_path: 'private/streaming-oversize.jpg',
      sort_order: 0,
    }])).resolves.toEqual({ images: [], failures: [imageId] });
  });

  it('keeps the total Gemini image payload within its bound', async () => {
    const firstId = '00000000-0000-4000-8000-000000000011';
    const secondId = '00000000-0000-4000-8000-000000000012';
    const rawBytes = Math.min(
      MAX_RECOMMENDATION_PHOTO_BYTES - 1,
      Math.floor(MAX_GEMINI_IMAGE_PAYLOAD_BYTES * 0.6 * 0.75),
    );
    const service = {
      storage: { from: vi.fn(() => ({
        createSignedUrl: vi.fn()
          .mockResolvedValueOnce({ data: { signedUrl: 'https://signed/first' }, error: null })
          .mockResolvedValueOnce({ data: { signedUrl: 'https://signed/second' }, error: null }),
      })) },
    } as unknown as SupabaseClient;
    vi.stubGlobal('fetch', vi.fn().mockImplementation(() => Promise.resolve(new Response(new Uint8Array(rawBytes), {
      status: 200,
      headers: { 'content-type': 'image/jpeg' },
    }))));

    const result = await loadRecommendationImages(service, [
      { id: firstId, storage_path: 'private/first.jpg', sort_order: 0 },
      { id: secondId, storage_path: 'private/second.jpg', sort_order: 1 },
    ]);

    expect(result.images).toHaveLength(1);
    expect(result.images[0]?.data.length).toBeLessThanOrEqual(MAX_GEMINI_IMAGE_PAYLOAD_BYTES);
    expect(result.failures).toEqual([secondId]);
  });
});
