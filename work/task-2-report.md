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

## Review hardening follow-up

### Security changes

- Evidence paths now have the binding
  `<user-id>/<submission-id>/<UUIDv4-token>/<side>.<ext>`. Finalisation checks
  the authenticated user and draft, requires valid UUIDv4-shaped random tokens,
  and requires the same token for the `front` and `back` objects. The server
  route is responsible for generating the cryptographically random UUID; SQL
  enforces its shape and binding without attempting to manufacture entropy.
- Draft creation is now service-role-only and accepts an explicit user ID. The
  later server route authenticates the browser user, calculates the HMAC with
  `KYC_IC_HMAC_KEY`, then calls the RPC. No SQL function reads, stores, or
  duplicates that secret, and browser callers cannot submit arbitrary hash
  values to the draft RPC.
- Raw evidence paths are now returned only by the service-role-only
  three-argument `get_kyc_document_view(submission, side, actor)` boundary.
  The server route supplies the already-authenticated admin ID for the safe
  audit actor. The previous browser-callable signature is removed; browser
  clients cannot obtain a raw path.
- Retention claims are stored per evidence row, not per submission. The worklist
  is returned in submission/side order and each side can be confirmed exactly
  once. Rejected/superseded retention starts at the transition event, never at
  object creation. Approved retention starts from account closure or replacement
  approval as applicable.
- All existing legacy SHA-256 single-document rows are marked legacy regardless
  of their historical status. Legacy active records move to `info_requested`;
  historical terminal rows start a new conservative 90-day retention clock at
  migration time when no terminal-event timestamp was available.
- The replay command now requires `KYC_TEST_DATABASE_URL`; it refuses generic
  database variables and verifies that the direct/pooler URL host or username
  identifies the project in `KYC_TEST_SUPABASE_URL`.

### TDD evidence

1. Replaced the direct integration suite with RED assertions for a server-only
   draft RPC, UUIDv4-token paths, same-token front/back binding, browser denial
   of raw document paths, per-side retention claiming, and safe audit payloads.
   Before migration updates: 6 of 8 tests failed because the server-only
   signature and boundaries did not exist.
2. After the initial migration update: 6 of 8 passed. The remaining failures
   showed the browser could no longer resolve the old raw-path signature (safe,
   but the assertion expected the wrong error wording) and that an existing
   document table needed an additive `purge_claimed_at` migration statement.
3. Added that additive column and corrected the assertion to require no browser
   result/path rather than a particular PostgREST error. A stale test worklist
   exposed global eligible rows, so the retention assertion was scoped to its
   own submission while still proving each of its two sides is claimed once.
4. GREEN: focused integration passed 8/8.

### Follow-up verification

- Full clean replay with the hardened designated-test runner — passed through
  `033_kyc_security_hardening.sql`.
- `RUN_KYC_DB_INTEGRATION=1 npx vitest run tests/integration/kyc-security.spec.ts`
  after replay — passed: 1 file, 8 tests.
- `npm test` — passed: 45 tests with 8 database integration tests skipped as
  intended when the run flag is absent.
- `npm run lint` and `git diff --check` — passed.

## Replay confirmation hardening

The replay runner now refuses to create a database connection unless
`KYC_TEST_DB_RESET_CONFIRM` exactly equals the project ref parsed from
`KYC_TEST_SUPABASE_URL` and already matched against `KYC_TEST_DATABASE_URL`.
This makes the destructive `DROP SCHEMA public` an explicit, non-interactive
per-invocation action even if the KYC test variables were accidentally pointed
at a production project. The README documents the acknowledgement command.

Verification: the runner was invoked with all test database inputs but without
the confirmation; it refused before connecting (`missing-confirmation-refusal-verified`).
It was then invoked with the confirmation derived from the designated test URL:
full clean replay passed and the focused KYC integration suite passed 8/8.

`npm run lint` was also run after this change. It exits non-zero on 167
pre-existing repository-wide errors in unrelated generated/UI and vendor files;
the replay runner, README, migration, and integration suite introduce none.

## Exact replay-target validation follow-up

The confirmation gate now uses strict parsers rather than substring matching:
the API URL must be exactly `<20-char-ref>.supabase.co`; the database URI must
be either `db.<20-char-ref>.supabase.co` or a recognised Supabase pooler URL
whose username is exactly `postgres.<20-char-ref>`. The parsed API and database
refs, and `KYC_TEST_DB_RESET_CONFIRM`, must be identical before `pg.Client` is
created. This rejects empty, mismatched, and substring-only references.

`node --test scripts/lib/kyc-test-db-target.test.mjs` passed 2/2 valid/rejection
cases. The missing-confirmation refusal was re-demonstrated safely, then the
explicitly confirmed clean replay and focused KYC integration suite passed.
The earlier lint result remains accurate: this follow-up did not rerun it
because it changes only the isolated runner/parser and documentation.
