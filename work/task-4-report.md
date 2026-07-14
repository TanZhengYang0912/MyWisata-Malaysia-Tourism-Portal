# Task 4 report — customer KYC decisions and safe DTOs

## Delivered

- Preserved Task 3's dual-file upload contract while giving the customer form separate labelled front/back inputs, independent validation errors, and a submit gate that remains disabled until both valid files are selected. The form posts `frontFile` and `backFile` and only clears selected files after a successful upload.
- Added a customer-only `/api/kyc/submission` route that authenticates the caller, fetches the newest row through the server-side service client, and emits a safe DTO containing status, submission/review times, reason code and optional detail. Storage paths, document rows, IC fingerprints and hashes are never serialized.
- The customer page now renders the newest submission irrespective of status. Rejected and information-requested states show mapped standard customer-safe copy, optional reviewer detail, review time and an explicit “Start New KYC Submission” flow. Resubmission invokes the existing server-side `begin_kyc_submission` procedure rather than replacing evidence objects.
- Split KYC contracts into `CustomerKycSubmission` and `AdminKycSubmission`. The latter carries only `{ side: 'front' | 'back' }` metadata. Browser code no longer imports or calls `getKycDocumentSignedUrl`; admin document viewing exclusively requests the guarded `/api/admin/kyc/documents/[submissionId]/[side]` endpoint.
- Added a guarded admin-submissions route so the admin browser receives safe metadata only. Raw paths remain server-only.
- Added a Playwright scenario covering dual input availability/disabled state and multipart field names. It documents the required rejected-fixture assertions, but cannot execute in this worktree due to the preflight blocker below.

## TDD evidence

1. RED: added `lib/kyc/__tests__/customer-submission.test.ts` for safe DTO mapping and reason copy. `npx vitest run lib/kyc/__tests__/customer-submission.test.ts` failed as expected because `../customer-submission` did not exist.
2. GREEN: implemented the mapper and reason copy without carrying row extras into the DTO. The focused KYC tests then passed.

## Verification

- `npx vitest run lib/kyc/__tests__` — passed: 4 files, 12 tests.
- Targeted ESLint for new DTO/routes/tests — passed.
- `git diff --check` — passed.
- `npx playwright test tests/e2e/kyc-submission.spec.ts --project=chromium` — blocked before test execution. Playwright's `webServer` invokes `npm run dev`, which fails with: `Next.js inferred your workspace root, but it may not be correct. We couldn't find the Next.js package (next/package.json) from the project directory: C:\\Users\\tanzh\\Documents\\GitHub\\FYP-industrial-project\\.worktrees\\kyc-security-hardening\\app`. Next recommends setting `turbopack.root` or making Next resolvable. Per task scope, no Turbopack/Next config was changed, so E2E is not claimed as passed.
- `npx tsc --noEmit --pretty false` — blocked by unrelated existing Google Maps declarations/dependencies and duplicate `contentReviewSchema`/Vitest-config entries. The earlier run showed no Task 4 errors after mapper fixes.

## Scope note

Generated `test-results` changes from the failed Playwright preflight were intentionally not included in the Task 4 commit.
