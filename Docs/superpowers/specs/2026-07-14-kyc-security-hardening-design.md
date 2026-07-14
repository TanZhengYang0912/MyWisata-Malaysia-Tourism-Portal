# KYC Security Hardening Design

## Goal

Close server-side tier-gate bypasses and replace mutable single-file KYC evidence with an auditable, immutable two-file submission flow.

## Scope

- Enforce withdrawal eligibility inside `debit_withdrawal`.
- Enforce recommendation eligibility inside `submit_recommendation`.
- Require every supported KYC document type to contain separate `front` and `back` files.
- Keep submitted evidence immutable; re-submission always creates a new submission version.
- Add structured KYC review reasons and show formal rejection reasons to the applicant.
- Replace plaintext-equivalent SHA-256 IC fingerprints with versioned HMAC-SHA-256 fingerprints.
- Use private, short-lived, audit-logged document viewing for administrators.
- Add a public `Verified Contributor` badge based only on an approved KYC boolean.
- Add database/integration coverage for direct-RPC and storage-policy bypass attempts.

## Explicitly Out of Scope

- Changing the existing KYC approval authority or anti-self-dealing rules.
- Publishing KYC status, dates, document paths, IC values, hashes, or rejection details publicly.
- Retrofitting legacy single-file evidence into artificial front/back records.

## Tier Gates

`debit_withdrawal` is the authoritative withdrawal boundary. It must lock and validate the caller's user row and require all of:

- `tier = 'kyc_verified'`
- `kyc_status = 'approved'`
- non-null `stripe_connect_account_id`
- `stripe_payouts_enabled = true`

The wallet UI and Connect onboarding remain usability checks only. A direct Supabase RPC invocation must receive a domain error when any condition is absent.

`submit_recommendation` is the authoritative recommendation boundary. It must read the caller from `auth.uid()`, require at least `profile_complete`, and reject lower tiers before any rate-limit or insertion work. The existing Next API check remains for clear HTTP errors; the RPC duplicates it as the security boundary.

## KYC Evidence Model

Create a child evidence table with one row per submission side. Its identity is the KYC submission and a constrained side enum: `front` or `back`. A unique constraint on `(submission_id, side)` guarantees exactly one item per side.

New submissions are created through one two-file endpoint. It validates both files before upload: accepted MIME types, file size, and magic bytes. Each stored object receives a random, submission-specific path. The endpoint writes `pending` only after both objects and both child rows exist. Failed database finalisation leaves only orphaned objects, which a privileged cleanup job deletes.

Clients receive INSERT-only storage access for their own submission folder. They receive no UPDATE, overwrite, or DELETE access. Reviewers can inspect submitted evidence only through a server-generated signed URL lasting five minutes. Generating that URL writes an audit record without including the URL or storage path.

At most one submission may be active (`pending` or `info_requested`) per user. `info_requested` and `rejected` cases create a fresh submission instead of editing old evidence. The former active record becomes `superseded`; all prior evidence is immutable.

## Review Reasons and Applicant UX

Reject requires one of these codes:

- `document_unreadable`
- `document_incomplete`
- `document_mismatch`
- `document_expired`
- `document_suspected_tampering`
- `other`

`other` requires a reason detail of at least ten characters. `info_requested` uses all codes except `document_suspected_tampering` and presents the reason as a supplement request.

The applicant KYC page shows the newest submission even if it is rejected. It presents status, review date, standard reason copy, optional detail, and a button to start a fresh dual-file submission. Rejection details are visible only to that applicant and authorised administrators.

## IC Fingerprinting

New submissions use `HMAC-SHA-256(normalizedIC, KYC_IC_HMAC_KEY)`, calculated server-side. Store `ic_hash_version = 'hmac_sha256_v1'`. The key never reaches the browser or logs. Future rotations add a version and retain prior keys in controlled read-only secret storage for comparisons. Existing SHA-256 fingerprints remain as legacy audit data and cannot be rehashed without IC plaintext.

## Privacy, Retention, and Audit

Audit logs may contain only submission ID, actor, action, reason code, timestamp, and file slot. They must not contain the IC, IC fingerprint, file name, storage path, signed URL, or document contents.

Evidence from `rejected` or `superseded` submissions is deleted after 90 days. Approved evidence is deleted 90 days after account closure or after a replacement KYC approval. Each deletion emits an audit event while preserving non-sensitive submission metadata and review reasons.

## Public Badge

Public profile surfaces may render `Verified Contributor` when `public_users.is_kyc_verified` is true. The badge appears on public recommendation authors, comment/activity contributor cards, and public profiles. It is hidden for suspended or non-verified users. No additional verification data is exposed.

## Legacy Migration and Rollout

Approved and rejected historical submissions remain marked `legacy_single_document`. Existing pending and information-requested submissions are moved to `info_requested` with a message requiring dual-file resubmission. Only dual-file submissions are eligible for future approval.

Deploy in this order: schema/RPC/RLS/cleanup support and compatible reads; server and UI changes; then enable the new submission entry point. If rollout fails, new submission creation is disabled rather than permitting an incomplete evidence record.

## Verification

The merge gate must include database/integration tests proving:

- a non-KYC user cannot directly invoke `debit_withdrawal`;
- a below-profile-complete user cannot directly invoke `submit_recommendation`;
- a submission without both sides cannot become pending;
- a pending evidence object cannot be overwritten;
- a re-submission preserves old evidence;
- unauthorised users cannot read evidence;
- review reason code and `other` detail constraints are enforced.
