# Task 3 implementation report

To be completed by the implementer.
# Task 3 report — two-file server submission and secure document viewing

## Delivered

- Replaced `/api/kyc/upload`'s legacy `file` contract with required `frontFile` and `backFile` fields. Each is independently checked for supported MIME type, 5 MB limit, and matching magic bytes before any draft is created.
- The upload route authenticates the caller, computes the versioned IC HMAC on the server with `hashICWithHmac`/`KYC_IC_HMAC_KEY`, then calls the service-only `begin_kyc_submission` contract with the verified user ID. Neither the HMAC key nor the fingerprint/path appears in the browser response, audit, or notification payloads.
- The route generates one `crypto.randomUUID()` token and uploads both objects with the service client to the required `<user>/<submission>/<token>/front.<ext>` and `back.<ext>` paths. It finalizes through the authenticated client (so SQL preserves caller identity). Any upload or finalize error removes only objects uploaded by that request through service role and abandons only the caller's draft.
- Added `/api/admin/kyc/documents/[submissionId]/[side]`. It requires a session, validates UUID and side, invokes the existing service-only `get_kyc_document_view` RPC with the verified actor ID, creates a service-role signed URL for 300 seconds, and returns only `{ data: { signedUrl, expiresIn: 300 } }`. It maps unauthenticated, forbidden, and missing evidence to 401/403/404 without exposing a storage path.
- Updated the customer KYC form to submit separate front/back files and consume only the safe pending-status response.
- Added `KycSubmissionDocumentRow`; expanded `KycSubmissionRow` for draft/superseded status, version/hash, legacy, retention, queue and review-reason fields; removed application type dependence on legacy `document_url`.
- Hardened short-buffer magic-byte validation to return `false` instead of throwing. Migration 033 now omits `document_url` from new draft inserts and explicitly drops a legacy KYC delete policy name.

## TDD evidence

1. RED integration: extended `tests/integration/kyc-security.spec.ts` so a draft with only its front object cannot finalize, and so direct authenticated insert/update/delete storage actions are exercised. Before the migration/policy replay, the direct delete assertion showed an important Storage API behavior: DELETE returned a successful no-op, but never removed the object because RLS filtered it. The final test proves the security property by verifying the service client can still download the object after the browser delete attempt.
2. RED unit: added `lib/kyc/__tests__/submission.test.ts`; it initially failed because `lib/kyc/submission` did not exist. After implementing server helper validation/path construction it exposed a short-buffer `RangeError` in `validateMagicBytes`.
3. GREEN: added the length guard and minimal helpers. Focused KYC helpers/hash tests passed (4/4), then all focused KYC unit tests passed (8/8).
4. GREEN integration after an explicitly confirmed fresh replay: all 8 KYC server-security integration tests passed, including service-only draft/view RPC denial, one-side-finalize denial, random shared-token paths, and browser storage write/delete protection.

## Verification

- `KYC_TEST_DB_RESET_CONFIRM=<derived exact test project ref> npm run test:kyc-db:replay` — passed, applying all migrations through 033. The confirmation value was derived locally from `KYC_TEST_SUPABASE_URL` and never printed.
- `RUN_KYC_DB_INTEGRATION=1 npx vitest run tests/integration/kyc-security.spec.ts` — passed: 8/8.
- `npx vitest run lib/kyc/__tests__` — passed: 3 files, 8/8 tests.
- `git diff --check` — passed.
- Targeted ESLint for changed server routes/helpers/types/tests — passed. Including the pre-existing customer KYC page reports four existing `react-hooks/set-state-in-effect`/`no-explicit-any` findings unrelated to this two-file change.
- `npm test` — repository harness currently exits non-zero because Vitest also discovers `scripts/lib/kyc-test-db-target.test.mjs`, which is a Node `node:test` file and has no Vitest suite. Its own three Node tests pass first; all Vitest suites report 47 passed and 8 intentionally skipped integration tests.
- `npx tsc --noEmit` — blocked by pre-existing unrelated Google Maps dependency/global declarations, duplicate `contentReviewSchema`, and duplicate Vitest config keys; no Task 3-specific TypeScript error was emitted.

## Review follow-up

- Upload cleanup now calls `abandon_kyc_submission` before any object removal and deletes the deterministic front/back pair only when the RPC positively confirms the caller draft was abandoned. A false/error result (including a finalize race that already moved the row to pending) preserves the objects, logs only submission ID/reason, and returns a safe cleanup-resolution failure. Upload failures use the same deterministic pair, covering a Storage timeout where a write may have committed despite an error response.
- The admin document route authenticates before examining dynamic UUID/side parameters. A new route test verifies an unauthenticated malformed request is 401.
- Integration coverage now proves an authenticated applicant cannot download an evidence path. Browser DELETE is explicitly checked as an RLS no-op by confirming the service client can still download the object.
- Follow-up verification: targeted ESLint passed; admin route test passed (1/1); KYC integration passed (8/8); KYC unit tests passed (10/10).
