# Task 7 implementation report

## Implementation

- Added `POST /api/cron/purge-kyc-evidence`. It requires `Authorization: Bearer <CRON_SECRET>`, calls the service-only `purge_expired_kyc_evidence()` RPC, removes each claimed object from the private `kyc-documents` bucket, and calls `confirm_purged_kyc_evidence()` only after a successful object deletion. The response is aggregate `{ claimed, purged, failed }` counts; paths, hashes, URLs, and submission identifiers are never returned.
- Added route tests covering unauthorized access, successful object deletion/confirmation, and the failed-delete retry boundary. The test was observed failing with a missing route module before implementation, then passed after the route was added.
- Extended the protected KYC integration retention coverage. A 91-day-old rejected row claims both sides, private objects are removed, evidence worklist rows are confirmed/deleted, submission metadata remains, and audit payloads contain only submission ID and side. Approved evidence remains while an account is active, becomes eligible after a 90-day-old approved replacement, and is also eligible after account closure plus 90 days.
- Documented `KYC_IC_HMAC_KEY`, `RUN_KYC_DB_INTEGRATION`, all KYC test Supabase variables, `KYC_TEST_DB_RESET_CONFIRM`, and retention semantics in `README.md` without values or secrets.

## Verification evidence

- `npm run test:kyc-db:replay` — passed after deriving and explicitly setting the confirmation to the KYC test project's parsed reference; all migrations through `033_kyc_security_hardening.sql` applied.
- `RUN_KYC_DB_INTEGRATION=1 npx vitest run tests/integration/kyc-security.spec.ts` — passed, 9/9.
- `npx vitest run app/api/cron/purge-kyc-evidence/__tests__/route.test.ts` — passed, 3/3.
- `npm run lint` — passed.
- `npm test` — 67 tests passed and 9 skipped; command exits failed because two existing `.mjs` files (`scripts/lib/admin-review-kyc-sql-contract.test.mjs` and `scripts/lib/kyc-test-db-target.test.mjs`) are picked up by Vitest but contain no Vitest test suite.
- `npx playwright test tests/e2e/kyc-submission.spec.ts` — blocked before tests start by the existing Next/Turbopack workspace-root failure (`Next.js inferred your workspace root ... couldn't find next/package.json ... from ...\\app`). No Playwright pass is claimed.

The full TypeScript build was not claimed; known Next/Turbopack and existing typing/harness blockers remain outside this task.
