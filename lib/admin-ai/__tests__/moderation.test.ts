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
  reviewRecommendation,
  type AiModerationResult,
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
  return { service, createSignedUrl };
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

  it('does not let an AI duplicate finding reject without deterministic matches', () => {
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
    expect(result.suggestedAction).toBe('request_changes');
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
    expect(result.feedbackDraft).toBeNull();
    expect(result.findings).toEqual(expect.arrayContaining([{
      field: 'photos',
      severity: 'medium',
      kind: 'manual_review',
      message: 'Photo review requires manual review.',
      evidenceSummary: null,
    }]));
  });

  it('preserves legitimate non-photo feedback', async () => {
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
      feedbackDraft: 'Please provide a clearer description and recommendation reason.',
      photoAssessments: [{
        imageId,
        status: 'appears_relevant',
        message: 'The photo appears relevant.',
      }],
    }));

    const result = await reviewRecommendation(service, 'rec-1');

    expect(result.feedbackDraft).toBe('Please provide a clearer description and recommendation reason.');
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
});
