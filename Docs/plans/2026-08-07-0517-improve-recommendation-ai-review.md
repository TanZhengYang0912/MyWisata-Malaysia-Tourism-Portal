# Improved Recommendation AI Review Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the current generic Recommendation AI Review with a decision-first, evidence-backed advisory that analyses complete safe submission evidence and photos without taking moderation actions.

**Architecture:** Keep deterministic evidence checks and duplicate counts authoritative, then enrich them with a strictly validated Gemini text-and-image assessment. Apply server-side decision guardrails before returning a structured result, and let the detail page use the suggested feedback only as editable local form input.

**Tech Stack:** Next.js 16 App Router, TypeScript, Supabase, Gemini `generateContent`, Zod 4, React 19, TailwindCSS, Vitest, Playwright.

## Global Constraints

- AI Review remains read-only and Super-Admin-only.
- AI may suggest `approve`, `request_changes`, or `reject`, but never execute an action.
- `Reject` is limited to clear test content, spam, policy-invalid content, or a high duplicate signal.
- Missing or weak evidence produces `request_changes`, not `reject`.
- Legacy `state` is not required; location completeness uses Google place name, formatted address, latitude, and longitude.
- Duplicate comparison remains exact normalized-name matching and must be labelled `exact_normalized_name`.
- Raw contact values, submitter identity, storage paths, and signed URLs must never enter Gemini text or API output.
- Every active photo is analysed after server-side transformation; photo analysis cannot claim authenticity, location proof, ownership, or rights.
- “Use this reason” only fills local action and reason state; it does not open confirmation or submit.
- AI results are not persisted.
- No database migration and no new dependency.
- Preserve all unrelated dirty-worktree changes.

## Scope Boundaries

**Files modified:**

- `lib/admin-ai/moderation.ts`
- `lib/admin-ai/gemini.ts`
- `app/api/admin-ai/moderation-review/route.ts`
- `components/admin/recommendation-ai-review-panel.tsx`
- `components/admin/recommendation-detail-view.tsx`
- `app/admin/recommendations/__tests__/detail-page.test.ts`

**Files created:**

- `lib/admin-ai/__tests__/moderation.test.ts`
- `lib/admin-ai/__tests__/gemini.test.ts`
- `app/api/admin-ai/moderation-review/__tests__/route.test.ts`

**Files not modified:**

- `app/api/admin/recommendations/review/route.ts`
- recommendation submission form, schema, and RPC
- recommendation detail API
- email, notification, reward, and conversion code
- Supabase migrations
- Google Maps integration

---

### Task 1: Authoritative evidence checks and decision guardrails

**Files:**

- Modify: `lib/admin-ai/moderation.ts`
- Create: `lib/admin-ai/__tests__/moderation.test.ts`

**Interfaces:**

- Produces: `RecommendationEvidenceField`, `EvidenceCheck`, `ModerationFinding`, `PhotoAssessment`, `ModerationAssessment`.
- Produces: `buildEvidenceChecks(row, imageCount, duplicateCount): EvidenceCheck[]`.
- Produces: `applyDecisionGuardrails(aiResult, evidenceChecks, duplicateCount): Pick<ModerationAssessment, 'suggestedAction' | 'confidence' | 'feedbackDraft'>`.
- Consumes later: Task 2 adds the Gemini and photo data to `reviewRecommendation`.

- [ ] **Step 1: Write failing deterministic evidence tests**

Create `lib/admin-ai/__tests__/moderation.test.ts` with fixtures that prove location uses Google place evidence and never requires legacy state:

```ts
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
    expect(checks.some((check) => check.field === 'state')).toBe(false);
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
```

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```bash
npx vitest run lib/admin-ai/__tests__/moderation.test.ts
```

Expected: FAIL because the new types and functions are not exported.

- [ ] **Step 3: Replace the free-text assessment contract with explicit types and schemas**

In `lib/admin-ai/moderation.ts`, define:

```ts
export type RecommendationEvidenceField =
  | 'vendor_name'
  | 'description'
  | 'why_recommend'
  | 'category'
  | 'location'
  | 'contact'
  | 'photos'
  | 'image_attestation'
  | 'duplicate';

export type EvidenceCheckStatus =
  | 'passed'
  | 'missing'
  | 'invalid'
  | 'low_quality'
  | 'needs_manual_review';

export interface EvidenceCheck {
  field: RecommendationEvidenceField;
  label: string;
  status: EvidenceCheckStatus;
  message: string;
}

export interface ModerationFinding {
  field: RecommendationEvidenceField;
  severity: 'low' | 'medium' | 'high';
  kind: 'low_quality' | 'conflict' | 'spam' | 'test_content' | 'policy' | 'duplicate' | 'manual_review';
  message: string;
  evidenceSummary: string | null;
}

export interface PhotoAssessment {
  imageId: string;
  status: 'appears_relevant' | 'possible_conflict' | 'unclear' | 'could_not_analyse';
  message: string;
}

export interface AiModerationResult {
  suggestedAction: 'approve' | 'request_changes' | 'reject';
  confidence: 'low' | 'medium' | 'high';
  findings: ModerationFinding[];
  feedbackDraft: string | null;
  photoAssessments: PhotoAssessment[];
}

export interface ModerationAssessment {
  suggestedAction: AiModerationResult['suggestedAction'] | null;
  confidence: AiModerationResult['confidence'] | null;
  evidenceChecks: EvidenceCheck[];
  findings: ModerationFinding[];
  duplicateCount: number;
  duplicateBasis: 'exact_normalized_name';
  feedbackDraft: string | null;
  photoAssessments: PhotoAssessment[];
  aiAvailable: boolean;
}
```

Add the following strict Zod schema matching `AiModerationResult`. Limit finding and feedback strings to bounded lengths:

```ts
const aiResultSchema = z.object({
  suggestedAction: z.enum(['approve', 'request_changes', 'reject']),
  confidence: z.enum(['low', 'medium', 'high']),
  findings: z.array(z.object({
    field: z.enum([
      'vendor_name', 'description', 'why_recommend', 'category',
      'location', 'contact', 'photos', 'image_attestation', 'duplicate',
    ]),
    severity: z.enum(['low', 'medium', 'high']),
    kind: z.enum(['low_quality', 'conflict', 'spam', 'test_content', 'policy', 'duplicate', 'manual_review']),
    message: z.string().trim().min(1).max(300),
    evidenceSummary: z.string().trim().max(200).nullable(),
  }).strict()).max(20),
  feedbackDraft: z.string().trim().max(500).nullable(),
  photoAssessments: z.array(z.object({
    imageId: z.string().uuid(),
    status: z.enum(['appears_relevant', 'possible_conflict', 'unclear', 'could_not_analyse']),
    message: z.string().trim().min(1).max(300),
  }).strict()).max(5),
}).strict();
```

- [ ] **Step 4: Implement deterministic checks**

Export `RecommendationEvidenceRow` and implement `buildEvidenceChecks`. Use the same minimum lengths as `recommendationSubmissionSchema`: name 3, description 20, recommendation reason 20, one contact, one to five photos.

```ts
export function buildEvidenceChecks(
  row: RecommendationEvidenceRow,
  imageCount: number,
  duplicateCount: number,
): EvidenceCheck[] {
  const categoryName = Array.isArray(row.categories)
    ? row.categories[0]?.name
    : row.categories?.name;
  const hasLocation = Boolean(
    row.location_name?.trim()
    && row.formatted_address?.trim()
    && Number.isFinite(row.latitude)
    && Number.isFinite(row.longitude),
  );
  const hasContact = Boolean(
    row.contact_phone?.trim()
    || row.contact_email?.trim()
    || row.contact_website?.trim(),
  );

  return [
    checkText('vendor_name', 'Business name', row.vendor_name, 3),
    checkText('description', 'Description', row.description, 20),
    checkText('why_recommend', 'Recommendation reason', row.why_recommend, 20),
    {
      field: 'category',
      label: 'Category',
      status: categoryName ? 'passed' : 'missing',
      message: categoryName ? `Category: ${categoryName}` : 'Category is not available.',
    },
    {
      field: 'location',
      label: 'Google location',
      status: hasLocation ? 'passed' : 'missing',
      message: hasLocation ? 'Google location evidence is complete.' : 'Google location evidence is incomplete.',
    },
    {
      field: 'contact',
      label: 'Contact method',
      status: hasContact ? 'passed' : 'missing',
      message: hasContact ? 'At least one contact method is present.' : 'No contact method is present.',
    },
    {
      field: 'photos',
      label: 'Photos',
      status: imageCount >= 1 && imageCount <= 5 ? 'passed' : 'missing',
      message: `${imageCount} active photo${imageCount === 1 ? '' : 's'} attached.`,
    },
    {
      field: 'image_attestation',
      label: 'Image rights',
      status: row.image_attested_at ? 'passed' : 'missing',
      message: row.image_attested_at ? 'Image rights were attested.' : 'Image rights attestation is missing.',
    },
    {
      field: 'duplicate',
      label: 'Exact name matches',
      status: duplicateCount > 0 ? 'needs_manual_review' : 'passed',
      message: `${duplicateCount} exact normalized-name match${duplicateCount === 1 ? '' : 'es'}.`,
    },
  ];
}
```

Do not add a `state` check.

- [ ] **Step 5: Implement server-side action guardrails**

Implement:

```ts
const REJECT_KINDS = new Set<ModerationFinding['kind']>([
  'spam', 'test_content', 'policy', 'duplicate',
]);

export function applyDecisionGuardrails(
  ai: AiModerationResult,
  checks: EvidenceCheck[],
  duplicateCount: number,
) {
  const requiredIssue = checks.some((check) =>
    ['missing', 'invalid', 'low_quality'].includes(check.status));
  const photoConflict = ai.photoAssessments.some((photo) => photo.status === 'possible_conflict');
  const highFinding = ai.findings.some((finding) => finding.severity === 'high');
  const rejectBasis = ai.findings.some((finding) =>
    finding.severity === 'high' && REJECT_KINDS.has(finding.kind));

  let suggestedAction = ai.suggestedAction;
  if (suggestedAction === 'reject' && !rejectBasis && duplicateCount < 2) {
    suggestedAction = 'request_changes';
  }
  if (suggestedAction === 'approve' && (requiredIssue || photoConflict || highFinding)) {
    suggestedAction = 'request_changes';
  }

  return {
    suggestedAction,
    confidence: ai.confidence,
    feedbackDraft: suggestedAction === 'approve' ? null : ai.feedbackDraft,
  };
}
```

- [ ] **Step 6: Run Task 1 tests and verify GREEN**

Run:

```bash
npx vitest run lib/admin-ai/__tests__/moderation.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit Task 1**

```bash
git add lib/admin-ai/moderation.ts lib/admin-ai/__tests__/moderation.test.ts
git commit -m "feat: add recommendation AI evidence guardrails"
```

---

### Task 2: Safe multimodal Gemini payload and photo degradation

**Files:**

- Modify: `lib/admin-ai/gemini.ts`
- Modify: `lib/admin-ai/moderation.ts`
- Create: `lib/admin-ai/__tests__/gemini.test.ts`
- Modify: `lib/admin-ai/__tests__/moderation.test.ts`

**Interfaces:**

- Produces: `GeminiInlineImage`.
- Extends: `CallGeminiOptions` with `images?: GeminiInlineImage[]`.
- Produces: `buildSafeSubmissionText(row, imageCount, duplicateCount): string`.
- Produces: `loadRecommendationImages(service, rows): Promise<{ images: GeminiInlineImage[]; failures: string[] }>`.
- Produces: completed `reviewRecommendation(service, recommendationId): Promise<ModerationAssessment>`.

- [ ] **Step 1: Write failing Gemini payload privacy test**

Create `lib/admin-ai/__tests__/gemini.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from 'vitest';
import { callGemini } from '@/lib/admin-ai/gemini';

describe('callGemini multimodal payload', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.LLM_API_KEY;
  });

  it('redacts text and sends inline images without logging image data', async () => {
    process.env.LLM_API_KEY = 'test-key';
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      candidates: [{ content: { parts: [{ text: '{"ok":true}' }] } }],
    }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);

    await callGemini('system', 'Email: person@example.com', {
      images: [{ id: 'image-1', mimeType: 'image/jpeg', data: 'base64-image-data' }],
    });

    const body = JSON.parse(String(fetchMock.mock.calls[0][1]?.body));
    expect(body.contents[0].parts).toEqual([
      { text: expect.not.stringContaining('person@example.com') },
      { text: 'Photo ID: image-1' },
      { inlineData: { mimeType: 'image/jpeg', data: 'base64-image-data' } },
    ]);
    expect(log.mock.calls.flat().join(' ')).not.toContain('base64-image-data');
    log.mockRestore();
  });
});
```

- [ ] **Step 2: Run the Gemini test and verify RED**

Run:

```bash
npx vitest run lib/admin-ai/__tests__/gemini.test.ts
```

Expected: FAIL because `CallGeminiOptions` has no `images` and the request has no `inlineData`.

- [ ] **Step 3: Extend the low-level Gemini caller**

In `lib/admin-ai/gemini.ts` add:

```ts
export interface GeminiInlineImage {
  id: string;
  mimeType: 'image/jpeg' | 'image/png' | 'image/webp';
  data: string;
}

export interface CallGeminiOptions {
  temperature?: number;
  maxOutputTokens?: number;
  images?: GeminiInlineImage[];
}
```

Build request parts without putting image data into logs:

```ts
const parts = [
  { text: clean },
  ...(options.images ?? []).flatMap((image) => [
    { text: `Photo ID: ${image.id}` },
    { inlineData: { mimeType: image.mimeType, data: image.data } },
  ]),
];

if (process.env.NODE_ENV !== 'production') {
  console.log('[admin-ai] outgoing Gemini payload metadata:', JSON.stringify({
    systemPrompt,
    userText: clean,
    imageCount: options.images?.length ?? 0,
    imageIds: options.images?.map((image) => image.id) ?? [],
    imageMimeTypes: options.images?.map((image) => image.mimeType) ?? [],
  }).slice(0, 2000));
}
```

Use `parts` in `contents[0].parts`. Do not log or return the image bytes.

- [ ] **Step 4: Write failing photo and safe-summary tests**

Append pure safe-summary and bounded image-loader tests to `lib/admin-ai/__tests__/moderation.test.ts`:

```ts
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
```

- [ ] **Step 5: Run the moderation tests and verify RED**

Run:

```bash
npx vitest run lib/admin-ai/__tests__/moderation.test.ts
```

Expected: FAIL because complete evidence, image rows, and transformed bytes are not loaded.

- [ ] **Step 6: Read the complete evidence projection**

Update `reviewRecommendation` to explicitly select:

```ts
const { data: rec, error } = await service
  .from('vendor_recommendations')
  .select(`
    id, vendor_name, vendor_name_normalized, description, why_recommend,
    category_id, google_place_id, location_name, formatted_address,
    latitude, longitude, contact_phone, contact_email, contact_website,
    image_attested_at, state, categories(name)
  `)
  .eq('id', recommendationId)
  .maybeSingle();
```

Fetch active images with:

```ts
const { data: imageRows, error: imageError } = await service
  .from('recommendation_images')
  .select('id,storage_path,sort_order')
  .eq('recommendation_id', recommendationId)
  .eq('is_staged', false)
  .is('removed_at', null)
  .order('sort_order', { ascending: true });
```

- [ ] **Step 7: Transform and load every active image**

Implement a bounded helper that never exposes its input paths:

```ts
export async function loadRecommendationImages(
  service: SupabaseClient,
  rows: RecommendationImageRow[],
) {
  const loaded = await Promise.all(rows.slice(0, 5).map(async (row) => {
    try {
      const { data, error } = await service.storage
        .from('recommendation-images')
        .createSignedUrl(row.storage_path, 60, {
          transform: { width: 1024, height: 1024, resize: 'contain' },
        });
      if (error || !data?.signedUrl) throw new Error('signed_image_unavailable');
      const response = await fetch(data.signedUrl, { cache: 'no-store' });
      if (!response.ok) throw new Error('image_fetch_failed');
      const mimeType = normalizeImageMime(response.headers.get('content-type'));
      const dataBase64 = Buffer.from(await response.arrayBuffer()).toString('base64');
      return {
        image: { id: row.id, mimeType, data: dataBase64 },
        failure: null,
        imageId: row.id,
      };
    } catch {
      return { image: null, failure: row.id, imageId: row.id };
    }
  }));

  return {
    images: loaded.flatMap((item) => item.image ? [item.image] : []),
    failures: loaded.flatMap((item) => item.failure ? [item.failure] : []),
  };
}
```

Accept only JPEG, PNG, and WebP response MIME types. Treat all others as an individual photo failure.

- [ ] **Step 8: Build the safe text summary and combine results**

Export a pure text-summary helper. It must include contact kinds only:

```ts
export function buildSafeSubmissionText(
  rec: RecommendationEvidenceRow,
  imageCount: number,
  duplicateCount: number,
) {
  const categoryName = Array.isArray(rec.categories)
    ? rec.categories[0]?.name
    : rec.categories?.name;
  const contactKinds = [
    rec.contact_phone?.trim() ? 'phone' : null,
    rec.contact_email?.trim() ? 'email' : null,
    rec.contact_website?.trim() ? 'website' : null,
  ].filter((value): value is string => Boolean(value));

  return [
    `Vendor name: ${rec.vendor_name}`,
    `Description: ${rec.description ?? '(not provided)'}`,
    `Recommendation reason: ${rec.why_recommend ?? '(not provided)'}`,
    `Category: ${categoryName ?? '(not provided)'}`,
    `Google place name: ${rec.location_name ?? '(not provided)'}`,
    `Formatted address: ${rec.formatted_address ?? '(not provided)'}`,
    `Coordinates present: ${Number.isFinite(rec.latitude) && Number.isFinite(rec.longitude) ? 'yes' : 'no'}`,
    `Contact methods present: ${contactKinds.join(', ') || 'none'}`,
    `Photo count: ${imageCount}`,
    `Image rights attested: ${rec.image_attested_at ? 'yes' : 'no'}`,
    `Exact normalized-name matches: ${duplicateCount}`,
  ].join('\n');
}
```

Call Gemini with `temperature: 0`, at least `maxOutputTokens: 1200`, and transformed images. Catch Gemini/parsing errors inside `reviewRecommendation` and return:

```ts
{
  suggestedAction: null,
  confidence: null,
  evidenceChecks,
  findings: [],
  duplicateCount,
  duplicateBasis: 'exact_normalized_name',
  feedbackDraft: null,
  photoAssessments: photoFailures,
  aiAvailable: false,
}
```

After successful parsing, filter model `photoAssessments` to the active image IDs supplied in `GeminiInlineImage`, discard invented IDs, and merge one `could_not_analyse` assessment for every failed image ID. The response must never contain storage paths, signed URLs, or base64 image data.

- [ ] **Step 9: Run Task 2 tests and verify GREEN**

Run:

```bash
npx vitest run lib/admin-ai/__tests__/gemini.test.ts lib/admin-ai/__tests__/moderation.test.ts
```

Expected: PASS.

- [ ] **Step 10: Commit Task 2**

```bash
git add lib/admin-ai/gemini.ts lib/admin-ai/moderation.ts lib/admin-ai/__tests__/gemini.test.ts lib/admin-ai/__tests__/moderation.test.ts
git commit -m "feat: analyse recommendation photos safely"
```

---

### Task 3: Super Admin service-role boundary and degraded API response

**Files:**

- Modify: `app/api/admin-ai/moderation-review/route.ts`
- Create: `app/api/admin-ai/moderation-review/__tests__/route.test.ts`

**Interfaces:**

- Consumes: `reviewRecommendation(service, recommendationId)`.
- Produces: unchanged `POST /api/admin-ai/moderation-review` envelope with the new `ModerationAssessment`.

- [ ] **Step 1: Write failing route authorization tests**

Create `app/api/admin-ai/moderation-review/__tests__/route.test.ts` with hoisted mocks:

```ts
const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  isSuperAdmin: vi.fn(),
  reviewRecommendation: vi.fn(),
  createServiceClient: vi.fn(),
}));

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({ auth: { getUser: mocks.getUser } })),
}));
vi.mock('@/lib/supabase/service', () => ({
  createServiceClient: mocks.createServiceClient,
}));
vi.mock('@/lib/affiliate/admin-guard', () => ({
  isSuperAdmin: mocks.isSuperAdmin,
}));
vi.mock('@/lib/admin-ai/moderation', () => ({
  reviewRecommendation: mocks.reviewRecommendation,
}));

it('does not create a service client for an unauthenticated request', async () => {
  mocks.getUser.mockResolvedValue({ data: { user: null } });
  const response = await POST(validRequest);
  expect(response.status).toBe(401);
  expect(mocks.createServiceClient).not.toHaveBeenCalled();
});

it('does not create a service client for a non-Super-Admin request', async () => {
  mocks.getUser.mockResolvedValue({ data: { user: { id: 'user-1' } } });
  mocks.isSuperAdmin.mockResolvedValue(false);
  const response = await POST(validRequest);
  expect(response.status).toBe(403);
  expect(mocks.createServiceClient).not.toHaveBeenCalled();
});

it('creates service access only after Super Admin authorization', async () => {
  const service = { marker: 'service' };
  mocks.getUser.mockResolvedValue({ data: { user: { id: 'admin-1' } } });
  mocks.isSuperAdmin.mockResolvedValue(true);
  mocks.createServiceClient.mockReturnValue(service);
  mocks.reviewRecommendation.mockResolvedValue(validAssessment);
  const response = await POST(validRequest);
  expect(response.status).toBe(200);
  expect(mocks.reviewRecommendation).toHaveBeenCalledWith(service, recommendationId);
});
```

- [ ] **Step 2: Run route tests and verify RED**

Run:

```bash
npx vitest run app/api/admin-ai/moderation-review/__tests__/route.test.ts
```

Expected: FAIL because the route currently passes the cookie client to `reviewRecommendation`.

- [ ] **Step 3: Move service-client creation after authorization**

Update the route:

```ts
import { createServiceClient } from '@/lib/supabase/service';

// Parse body, authenticate, and check isSuperAdmin with the cookie client first.
const service = createServiceClient();
const assessment = await reviewRecommendation(service, parsed.data.recommendationId);
return apiOk(assessment);
```

Keep validation before database work. Preserve 404 for `recommendation_not_found`. Database/projection failures may still produce the existing safe 503 message. Gemini failures no longer throw because Task 2 returns deterministic degraded output.

- [ ] **Step 4: Run route tests and verify GREEN**

Run:

```bash
npx vitest run app/api/admin-ai/moderation-review/__tests__/route.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit Task 3**

```bash
git add app/api/admin-ai/moderation-review/route.ts app/api/admin-ai/moderation-review/__tests__/route.test.ts
git commit -m "fix: protect recommendation AI photo access"
```

---

### Task 4: Decision-first review card and editable reason handoff

**Files:**

- Modify: `components/admin/recommendation-ai-review-panel.tsx`
- Modify: `components/admin/recommendation-detail-view.tsx`
- Modify: `app/admin/recommendations/__tests__/detail-page.test.ts`

**Interfaces:**

- Produces: `RecommendationAiReviewPanel({ recommendationId, onUseReason })`.
- Produces: `onUseReason(action: 'request_changes' | 'reject', reason: string): void`.
- Consumes: the new `ModerationAssessment` response from Task 2.

- [ ] **Step 1: Extend the source/UI contract test and verify RED**

Add to `app/admin/recommendations/__tests__/detail-page.test.ts`:

```ts
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
```

Run:

```bash
npx vitest run app/admin/recommendations/__tests__/detail-page.test.ts
```

Expected: FAIL because the panel still displays the old four free-text fields.

- [ ] **Step 2: Replace the panel response type and props**

Import `ModerationAssessment` from `lib/admin-ai/moderation` and define:

```ts
type ReasonAction = 'request_changes' | 'reject';

interface RecommendationAiReviewPanelProps {
  recommendationId: string;
  onUseReason: (action: ReasonAction, reason: string) => void;
}
```

Do not duplicate the response interface in the component.

- [ ] **Step 3: Implement the Decision-first layout**

Derive display rows before rendering:

```ts
const failedChecks = result.evidenceChecks.filter((check) => check.status !== 'passed');
const passedChecks = result.evidenceChecks.filter((check) => check.status === 'passed');
const photoIssues = result.photoAssessments.filter((photo) => photo.status !== 'appears_relevant');
const actionLabel = result.suggestedAction === 'request_changes'
  ? 'Request changes'
  : result.suggestedAction === 'reject'
    ? 'Reject'
    : result.suggestedAction === 'approve'
      ? 'Approve'
      : null;
const canUseReason = (
  result.suggestedAction === 'request_changes'
  || result.suggestedAction === 'reject'
) && (result.feedbackDraft?.trim().length ?? 0) >= 10;
```

Render these sections in order:

```tsx
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
          <button key={`check-${check.field}`} type="button" onClick={() => scrollToEvidence(check.field)} className="block w-full text-left">
            <span className="font-semibold">{check.label}: </span>{check.message}
          </button>
        ))}
        {result.findings.map((finding, index) => (
          <button key={`finding-${finding.field}-${index}`} type="button" onClick={() => scrollToEvidence(finding.field)} className="block w-full text-left">
            <span className="font-semibold">{finding.field}: </span>{finding.message}
          </button>
        ))}
        {photoIssues.map((photo) => (
          <button key={`photo-${photo.imageId}`} type="button" onClick={() => scrollToEvidence('photos')} className="block w-full text-left">
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
    {result.duplicateCount} exact normalized-name {result.duplicateCount === 1 ? 'match' : 'matches'}
  </p>

  {result.feedbackDraft && (
    <section aria-label="Suggested feedback" className="rounded-lg bg-background p-3">
      <p className="font-bold text-foreground">Suggested feedback</p>
      <p className="mt-2 whitespace-pre-wrap text-muted-foreground">{result.feedbackDraft}</p>
      {canUseReason && (
        <Button size="sm" className="mt-3 w-full" onClick={() => onUseReason(result.suggestedAction as ReasonAction, result.feedbackDraft!.trim())}>
          Use this reason
        </Button>
      )}
    </section>
  )}
</div>
```

Needs attention combines:

- deterministic checks whose status is not `passed`;
- AI findings;
- failed/unclear/conflicting photo assessments.

Passed checks uses `evidenceChecks.filter(check => check.status === 'passed')`.

Define the stable mapping and helper used by finding buttons:

```ts
const FIELD_TARGETS: Partial<Record<RecommendationEvidenceField, string>> = {
  vendor_name: 'recommendation-field-vendor-name',
  description: 'recommendation-field-description',
  why_recommend: 'recommendation-field-why-recommend',
  category: 'recommendation-field-category',
  location: 'recommendation-field-location',
  contact: 'recommendation-field-contact',
  photos: 'recommendation-field-photos',
  image_attestation: 'recommendation-field-photos',
};

function scrollToEvidence(field: RecommendationEvidenceField) {
  const targetId = FIELD_TARGETS[field];
  if (!targetId) return;
  document.getElementById(targetId)
    ?.scrollIntoView({ behavior: 'smooth', block: 'center' });
}
```

Map fields only to stable IDs owned by the detail view; unknown targets render as text rather than throwing.

- [ ] **Step 4: Add editable feedback handoff**

Render “Use this reason” only when:

- `suggestedAction` is `request_changes` or `reject`;
- `feedbackDraft?.trim()` is at least 10 characters.

```tsx
<Button
  size="sm"
  className="w-full"
  onClick={() => onUseReason(result.suggestedAction as ReasonAction, result.feedbackDraft!.trim())}
>
  Use this reason
</Button>
```

This component must not import or call the review endpoint.

- [ ] **Step 5: Add field targets and the parent callback**

In `components/admin/recommendation-detail-view.tsx`, assign these exact IDs to the existing evidence wrappers:

```ts
const EVIDENCE_TARGET_IDS = {
  vendorName: 'recommendation-field-vendor-name',
  description: 'recommendation-field-description',
  whyRecommend: 'recommendation-field-why-recommend',
  category: 'recommendation-field-category',
  location: 'recommendation-field-location',
  photos: 'recommendation-field-photos',
  contact: 'recommendation-field-contact',
} as const;
```

Use `EVIDENCE_TARGET_IDS.vendorName` on the header wrapping the recommendation name, and use the remaining values on the existing Description, Why recommended, Category, Google location, Submission photos, and Contact methods containers. Do not add a target for legacy State.

Add:

```ts
function handleAiReason(
  suggestedAction: 'request_changes' | 'reject',
  feedbackDraft: string,
) {
  setAction(suggestedAction);
  setReason(feedbackDraft);
  setConfirmOpen(false);
  setError(null);
  requestAnimationFrame(() => {
    document.getElementById('review-reason')
      ?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  });
}
```

Pass it to the panel:

```tsx
<RecommendationAiReviewPanel
  recommendationId={detail.id}
  onUseReason={handleAiReason}
/>
```

Do not call `continueWithReason` or `submitReview` from this callback.

- [ ] **Step 6: Run Task 4 tests and verify GREEN**

Run:

```bash
npx vitest run app/admin/recommendations/__tests__/detail-page.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit Task 4**

```bash
git add components/admin/recommendation-ai-review-panel.tsx components/admin/recommendation-detail-view.tsx app/admin/recommendations/__tests__/detail-page.test.ts
git commit -m "feat: add decision-first recommendation AI review"
```

---

### Task 5: Integrated privacy, regression, and browser verification

**Files:**

- Modify only if verification exposes an in-scope defect in Tasks 1–4.

**Interfaces:**

- Verifies the completed feature; introduces no new public interface.

- [ ] **Step 1: Run all Recommendation AI focused tests**

```bash
npx vitest run \
  lib/admin-ai/__tests__/gemini.test.ts \
  lib/admin-ai/__tests__/moderation.test.ts \
  app/api/admin-ai/moderation-review/__tests__/route.test.ts \
  app/admin/recommendations/__tests__/detail-page.test.ts
```

Expected: all tests PASS.

- [ ] **Step 2: Run adjacent Admin recommendation regressions**

```bash
npx vitest run \
  app/api/admin/recommendations/__tests__ \
  app/admin/__tests__/recommendation-unread-ui.test.ts \
  lib/recommendations/__tests__/admin-detail.test.ts
```

Expected: all tests PASS.

- [ ] **Step 3: Run TypeScript and focused lint**

```bash
npx tsc --noEmit
npx eslint \
  lib/admin-ai/gemini.ts \
  lib/admin-ai/moderation.ts \
  lib/admin-ai/__tests__/gemini.test.ts \
  lib/admin-ai/__tests__/moderation.test.ts \
  app/api/admin-ai/moderation-review/route.ts \
  app/api/admin-ai/moderation-review/__tests__/route.test.ts \
  components/admin/recommendation-ai-review-panel.tsx \
  components/admin/recommendation-detail-view.tsx \
  app/admin/recommendations/__tests__/detail-page.test.ts
```

Expected: exit 0 with no errors or warnings.

- [ ] **Step 4: Independently audit privacy before browser testing**

Use `luna_worker` for a read-only review of the final diff. The delegated prompt must require it to verify:

- service client is created only after Super Admin authorization;
- raw contact values, submitter identity, storage paths, signed URLs, and image bytes are absent from logs and response data;
- the analysis path cannot call recommendation review RPCs or mutate tables;
- individual photo failures degrade safely;
- legacy state is not a required check.

The main agent reviews every finding and fixes only confirmed in-scope defects.

- [ ] **Step 5: Inspect the final diff**

```bash
git diff --check
git diff --name-only
```

Expected: no whitespace errors; only planned files plus pre-existing unrelated dirty files are present.

- [ ] **Step 6: Verify a real Pending recommendation with Playwright**

At `http://localhost:3000/admin/recommendations`:

1. Open a Pending recommendation with valid evidence and photos.
2. Run AI Review.
3. Confirm the card shows Suggested decision, confidence, Needs attention, Passed checks, exact normalized-name count, and photo assessments.
4. Confirm no State-missing finding appears.
5. For Request changes or Reject, click “Use this reason.”
6. Confirm the action selector and reason textarea are populated.
7. Confirm no confirmation dialog opened and no network request was made to `/api/admin/recommendations/review`.
8. Edit the reason text and verify Continue opens the existing confirmation dialog.
9. Cancel the dialog so browser verification does not mutate recommendation status.

- [ ] **Step 7: Verify degraded AI state**

Temporarily exercise the mocked/unavailable path through the focused test or a safe local-only configuration. Confirm deterministic checks and duplicate count remain visible while suggested action, confidence, and feedback draft are absent. Restore the environment before completing.

- [ ] **Step 8: Final verification commit if fixes were required**

If Task 5 caused code or test changes:

```bash
git add \
  lib/admin-ai/gemini.ts \
  lib/admin-ai/moderation.ts \
  lib/admin-ai/__tests__/gemini.test.ts \
  lib/admin-ai/__tests__/moderation.test.ts \
  app/api/admin-ai/moderation-review/route.ts \
  app/api/admin-ai/moderation-review/__tests__/route.test.ts \
  components/admin/recommendation-ai-review-panel.tsx \
  components/admin/recommendation-detail-view.tsx \
  app/admin/recommendations/__tests__/detail-page.test.ts
git commit -m "test: verify recommendation AI review workflow"
```

If no files changed, do not create an empty commit.

## Completion Checklist

- [ ] Decision-first card matches the approved Option A.
- [ ] Suggested action is advisory and cannot submit.
- [ ] Feedback draft handoff is editable and confirmation remains separate.
- [ ] Complete safe evidence and all readable photos are analysed.
- [ ] Exact duplicates are count-based and correctly labelled.
- [ ] Legacy state is never treated as required.
- [ ] Deterministic checks survive Gemini failure.
- [ ] Super Admin, privacy, and no-write boundaries are tested.
- [ ] Focused and adjacent tests, TypeScript, lint, and Playwright verification pass.
- [ ] No database migration or new dependency was added.
