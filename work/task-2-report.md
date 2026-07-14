# Task 2 implementation report

## Scope delivered

- Hardened `033_kyc_security_hardening.sql` as the authoritative KYC boundary.
- Added reproducible full-schema replay command: `npm run test:kyc-db:replay`.
- Extended direct database integration coverage. It is skipped only unless
  `RUN_KYC_DB_INTEGRATION=1`; credentials are read from the designated
  `KYC_TEST_*` variables without emitting their values.

## SQL implementation evidence

- Dual evidence is represented by `kyc_submission_documents`, with one unique
  `front`/`back` side per submission, globally unique object path, constrained
  MIME types, RLS enabled, and no grants or policies allowing authenticated
  callers to read paths.
- Removed authenticated `kyc-documents` Storage insert/update/select policies.
  Service-role routes own byte upload/deletion; the database checks only object
  existence. The old single-document `submit_kyc` RPC is no longer executable
  by authenticated clients and direct KYC table mutation privileges are revoked.
- `begin_kyc_submission` validates the versioned HMAC fingerprint and document
  type, locks per user, supersedes information requests, and rejects draft or
  pending duplicates. `finalize_kyc_submission` locks its caller-owned draft,
  validates exact bound front/back paths and objects, creates both evidence rows,
  then transitions to pending. `abandon_kyc_submission` deletes only a
  caller-owned draft.
- `admin_review_kyc` has a four-argument structured contract plus a compatible
  three-argument wrapper. It checks admin privilege/self-dealing, action and
  reason policy, updates tier/KYC state, and writes path/hash-free audit and
  notification records. `get_kyc_document_view` is admin-only and adds exactly
  one path-free view audit before returning a path to a server route.
- Legacy approved/rejected rows are marked single-document; active legacy rows
  become `info_requested` with `document_incomplete`.
- `purge_expired_kyc_evidence()` is service-role-only. It returns a claimed
  deletion worklist for object removal (Postgres does not delete Storage bytes),
  retaining submission metadata. `confirm_purged_kyc_evidence` removes a
  confirmed child row and writes an audit containing only submission ID and side.
- All security-definer functions in this migration pin
  `search_path = public, pg_temp`.

## Test-first evidence

1. RED: ran the integration suite before hardening. It failed because the
   applicant could select both stored evidence paths; this proved the missing
   RLS boundary. The structured-review test also exposed absent disposable role
   setup, which the test now creates through the service client.
2. GREEN: after migration application, the document table returns permission
   denied to the authenticated applicant and Storage overwrite fails. The
   focused suite passed 6/6.
3. RED: added the legacy-RPC regression assertion. Before revocation it reached
   the legacy implementation instead of returning a permission failure.
4. GREEN: revoked that RPC and direct table mutations; the focused suite passed
   6/6 again.

## Final verification

- `npm run test:kyc-db:replay` — passed; clean replay applied every migration,
  including 033.
- `RUN_KYC_DB_INTEGRATION=1 npx vitest run tests/integration/kyc-security.spec.ts`
  — passed: 1 file, 6 tests.
- `npm test` — passed: 8 files, 51 tests.
- `npm run lint` — passed.
- `git diff --check` — passed.

## Follow-on integration note

The existing single-file `/api/kyc/upload` route intentionally no longer has
database permission to use `submit_kyc`; Task 3 must replace it with the
two-file service-upload → finalise flow before that endpoint is deployed.
