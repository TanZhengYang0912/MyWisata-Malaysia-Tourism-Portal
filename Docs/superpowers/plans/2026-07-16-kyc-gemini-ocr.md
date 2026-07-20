# KYC Gemini OCR Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add consent-based Gemini Vision OCR as a non-blocking KYC review aid while retaining manual Admin approval as the only KYC decision-maker.

**Architecture:** The existing authenticated upload route validates and stores the two evidence images first. A server-only OCR adapter sends only the validated image bytes to Gemini, persists a minimal structured result through a service-role migration contract, then finalizes the submission even when OCR is unavailable. Admin APIs expose the review-safe result; the customer never receives extracted identity data.

**Tech Stack:** Next.js Route Handlers, TypeScript, Gemini REST API with `GOOGLE_AI_KEY`, Supabase/Postgres, Vitest.

## Global Constraints

- Accept JPEG, PNG, or WebP only; both front and back are mandatory for every document type.
- Require a KYC-specific consent checkbox before external AI processing.
- Gemini OCR is advisory only: no automatic approve/reject, no automatic KYC tier promotion.
- Persist no raw Gemini response and no complete document number; store only structured fields, HMAC and last four digits.
- OCR failure, timeout, malformed output, or quota exhaustion must produce `unavailable` and still allow manual KYC submission.
- Do not modify the Affiliate Link RLS policy; that work is owned by another contributor.

---

### Task 1: Define and test the server-only OCR contract

**Files:**
- Create: `lib/kyc/ocr.ts`
- Create: `lib/kyc/__tests__/ocr.test.ts`
- Modify: `.env.example` if the repository contains one; otherwise document `GEMINI_OCR_MODEL` in `README.md`

**Interfaces:**
- Produces `runKycOcr(input: KycOcrInput): Promise<KycOcrResult>`.
- `KycOcrResult.status` is exactly `matched | mismatch | unreadable | unavailable`.
- Input includes `documentType`, `enteredDocumentNumber`, `front: { mimeType; bytes }`, and `back: { mimeType; bytes }`.

- [ ] **Step 1: Write failing OCR adapter tests**

```ts
it('stores no raw model text and marks exact normalized number mismatch', async () => {
  mockGeminiJson({ holderName: 'Aminah Ali', documentNumber: '900101-14-1235', expiryDate: null, confidence: 0.91 });
  const result = await runKycOcr(validInput({ enteredDocumentNumber: '900101-14-1234' }));
  expect(result).toMatchObject({ status: 'mismatch', documentNumberLast4: '1235', mismatchFields: ['document_number'] });
  expect(result).not.toHaveProperty('rawText');
  expect(result).not.toHaveProperty('documentNumber');
});

it('returns unavailable rather than throwing for a Gemini 429', async () => {
  mockGeminiFailure(429);
  await expect(runKycOcr(validInput())).resolves.toMatchObject({ status: 'unavailable' });
});
```

- [ ] **Step 2: Run the test and verify it fails**

Run: `npm test -- --run lib/kyc/__tests__/ocr.test.ts`

Expected: FAIL because `lib/kyc/ocr.ts` does not exist.

- [ ] **Step 3: Implement the minimal adapter**

```ts
export type KycOcrResult = {
  status: 'matched' | 'mismatch' | 'unreadable' | 'unavailable';
  holderName: string | null;
  documentNumberHmac: string | null;
  documentNumberLast4: string | null;
  expiryDate: string | null;
  confidence: number | null;
  mismatchFields: string[];
  providerModel: string;
};

export async function runKycOcr(input: KycOcrInput): Promise<KycOcrResult> {
  // POST Gemini inlineData parts, require a JSON-only response, normalize values,
  // compare the HMAC of extracted document number with input.enteredDocumentNumber,
  // and convert every transport/model failure to status: 'unavailable'.
}
```

The prompt must ask only for `holderName`, `documentNumber`, `expiryDate`, `confidence`, and `unreadable`; it must state that output never makes an approval decision. Delete the extracted number from local variables after deriving HMAC/last four digits.

- [ ] **Step 4: Run focused tests**

Run: `npm test -- --run lib/kyc/__tests__/ocr.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/kyc/ocr.ts lib/kyc/__tests__/ocr.test.ts README.md
git commit -m "feat: add non-blocking KYC OCR adapter"
```

### Task 2: Add minimal, service-only OCR persistence

**Files:**
- Create: `supabase/migrations/058_kyc_ocr_results.sql`
- Create: `supabase/migrations/__tests__/kyc_ocr_results.sql` if SQL migration tests are supported; otherwise test through route mocks in Task 3.

**Interfaces:**
- Produces table `kyc_ocr_results` with one row per submission.
- Produces service-only RPC `record_kyc_ocr_result(...)`.
- Extends `begin_kyc_submission(..., p_ocr_consent boolean)` and rejects false consent.

- [ ] **Step 1: Write migration assertions first**

```sql
select throws_ok(
  $$ select public.record_kyc_ocr_result('00000000-0000-0000-0000-000000000000', 'matched', null, null, null, null, '{}', 'x') $$,
  'service_role_required'
);
```

- [ ] **Step 2: Run migration test or create a disposable local database**

Run: `supabase db reset` (only against the configured disposable test project).

Expected: current schema has no `kyc_ocr_results` table.

- [ ] **Step 3: Write the migration**

```sql
create table public.kyc_ocr_results (
  submission_id uuid primary key references public.kyc_submissions(id) on delete restrict,
  status text not null check (status in ('matched','mismatch','unreadable','unavailable')),
  holder_name text,
  document_number_hmac text,
  document_number_last4 text check (document_number_last4 is null or document_number_last4 ~ '^[0-9A-Za-z]{4}$'),
  expiry_date date,
  confidence numeric(4,3),
  mismatch_fields text[] not null default '{}',
  provider_model text not null,
  processed_at timestamptz not null default now()
);
revoke all on public.kyc_ocr_results from public, anon, authenticated;
```

Add `ocr_consent_at timestamptz` to `kyc_submissions`, require `p_ocr_consent = true` in the service-only begin RPC, and make `record_kyc_ocr_result` service-role-only. Do not add a customer SELECT policy.

- [ ] **Step 4: Re-run schema reset / migration verification**

Run: `supabase db reset`

Expected: migration completes and authenticated role cannot read `kyc_ocr_results` directly.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/058_kyc_ocr_results.sql
git commit -m "feat: persist minimal KYC OCR review results"
```

### Task 3: Integrate consent and OCR into the KYC upload route

**Files:**
- Modify: `app/api/kyc/upload/route.ts`
- Modify: `app/customer/kyc/page.tsx`
- Create: `app/api/kyc/upload/__tests__/route.test.ts`

**Interfaces:**
- Form field `ocrConsent` must equal `'true'`.
- Successful upload response remains `{ submissionId, status: 'pending' }`; OCR status is not exposed to the customer.

- [ ] **Step 1: Write failing route tests**

```ts
it('rejects a KYC upload without explicit OCR consent', async () => {
  const response = await POST(requestWithValidImages({ ocrConsent: undefined }));
  expect(response.status).toBe(422);
  expect(await response.json()).toMatchObject({ error: { code: 'OCR_CONSENT_REQUIRED' } });
});

it('finalizes KYC when Gemini is unavailable', async () => {
  mockRunKycOcr({ status: 'unavailable' });
  const response = await POST(requestWithValidImages({ ocrConsent: 'true' }));
  expect(response.status).toBe(201);
  expect(mockRecordOcr).toHaveBeenCalledWith(expect.objectContaining({ status: 'unavailable' }));
  expect(mockFinalize).toHaveBeenCalled();
});
```

- [ ] **Step 2: Run the route test and verify it fails**

Run: `npm test -- --run app/api/kyc/upload/__tests__/route.test.ts`

Expected: FAIL because consent and OCR are absent.

- [ ] **Step 3: Implement the flow**

Call `begin_kyc_submission` with `p_ocr_consent: true`; upload immutable front/back files as today; call `runKycOcr`; upsert the minimal result with the service client; then call `finalize_kyc_submission`. A failed record write must log an internal error and be represented as `unavailable`, never expose Gemini errors to the user and never prevent finalize.

Add a required checkbox below the front/back fields:

```tsx
<label><input required checked={ocrConsent} onChange={(e) => setOcrConsent(e.target.checked)} type="checkbox" />
  I agree that a third-party AI service may assist with reading my document. A human administrator makes the final decision.
</label>
```

- [ ] **Step 4: Run tests and type check**

Run: `npm test -- --run app/api/kyc/upload/__tests__/route.test.ts lib/kyc/__tests__/ocr.test.ts && npx tsc --noEmit`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/api/kyc/upload/route.ts app/customer/kyc/page.tsx app/api/kyc/upload/__tests__/route.test.ts
git commit -m "feat: require consent and run KYC OCR"
```

### Task 4: Surface OCR results only to authorised Admin reviewers

**Files:**
- Modify: `backend/core/types.ts`
- Modify: `app/api/admin/kyc/submissions/route.ts`
- Modify: `app/admin/kyc/page.tsx`
- Modify: `app/api/admin/kyc/submissions/__tests__/route.test.ts`

- [ ] **Step 1: Write failing Admin API/UI tests**

```ts
it('returns OCR data to an admin but not a raw document number', async () => {
  const response = await GET();
  const body = await response.json();
  expect(body.data.submissions[0].ocr).toMatchObject({ status: 'mismatch', documentNumberLast4: '1234' });
  expect(JSON.stringify(body)).not.toContain('900101-14-1234');
});
```

- [ ] **Step 2: Run test and verify it fails**

Run: `npm test -- --run app/api/admin/kyc/submissions/__tests__/route.test.ts`

Expected: FAIL because Admin DTO has no OCR property.

- [ ] **Step 3: Implement the safe DTO and panel**

Add `ocr` to `AdminKycSubmission` with `status`, `holderName`, `documentNumberLast4`, `expiryDate`, `confidence`, `mismatchFields`, and `processedAt`. Join `kyc_ocr_results` in the service-only query. Render an `OCR check` panel with the four states, extracted fields, and mismatch labels. It must contain no approve/reject controls: retain the existing human review controls.

- [ ] **Step 4: Run focused tests**

Run: `npm test -- --run app/api/admin/kyc/submissions/__tests__/route.test.ts && npx eslint app/admin/kyc/page.tsx app/api/admin/kyc/submissions/route.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/core/types.ts app/api/admin/kyc/submissions/route.ts app/admin/kyc/page.tsx app/api/admin/kyc/submissions/__tests__/route.test.ts
git commit -m "feat: show safe OCR checks in KYC review"
```
