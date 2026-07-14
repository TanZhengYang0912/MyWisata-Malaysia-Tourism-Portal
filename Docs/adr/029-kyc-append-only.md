# ADR-029: KYC Submissions — Append-Only Event Log

**Status:** Accepted  
**PR:** 029 — `029_kyc_append_only.sql`

---

## Context

KYC review decisions (approve, reject, request resubmission) are compliance-sensitive: regulators and audit teams need to know not just the current status, but the full history of who reviewed what and when. A mutable-status design (`UPDATE kyc_submissions SET status = 'rejected'`) destroys intermediate states and is difficult to audit. The question is whether to model `kyc_submissions` as a mutable record or an append-only event log.

A secondary question: should the user's queue position (for pending review display) be computed at query time or stored?

---

## Decisions

### Append-Only Event Sourcing (H2)

`kyc_submissions` rows are **never updated after insert**. Each event in the review lifecycle is a new row:

| Event | New row `status` |
|---|---|
| User submits documents | `pending` |
| Admin requests correction | `info_requested` |
| User resubmits | `pending` |
| Admin approves | `approved` |
| Admin rejects | `rejected` |

The current KYC state for a user is the `status` of their most recent row (`ORDER BY created_at DESC LIMIT 1`). All previous rows remain as immutable history.

**Why not UPDATE**: once a row is updated, the previous state is gone. If an admin accidentally approves the wrong user and the record is later disputed, there is no way to reconstruct what happened. Append-only makes every state transition permanent and auditable.

### One Active Submission Per User (D1)

Only one `pending` or `info_requested` submission may exist per user at a time. This is enforced by a partial UNIQUE index:

```sql
CREATE UNIQUE INDEX idx_kyc_one_active_per_user
  ON kyc_submissions(user_id)
  WHERE status IN ('pending', 'info_requested');
```

If the user tries to submit while one is already active, the index raises a unique violation. The submit RPC catches this and returns `code: 'submission_already_active'`.

### Queue Position — Stored, Not Computed

The review queue displays each submission's position (e.g. "You are #14 in the queue"). Computed position (`SELECT COUNT(*) FROM kyc_submissions WHERE status = 'pending' AND created_at < $1`) would be accurate but requires a sequential scan on every page load. Instead, `queue_position` is written at insert time inside the submit RPC:

```sql
queue_position = (SELECT COALESCE(MAX(queue_position), 0) + 1
                  FROM kyc_submissions WHERE status = 'pending')
```

The position is taken under the same transaction that inserts the row. If a previous submission is approved or rejected, positions are not recomputed — they are ordinal insertion positions, not dense ranks. This is acceptable: "position 14 in queue" means "14th to arrive", which is still useful and requires no background job.

### No Triggers

State transitions are managed by SECURITY DEFINER RPCs (`submit_kyc`, `review_kyc_submission`), not triggers. Triggers fire invisibly and make the logic hard to trace; RPC calls appear in application logs and are unit-testable.

---

## Scope

- **Migration**: partial UNIQUE index on `kyc_submissions`; `queue_position` column; `submit_kyc` and `review_kyc_submission` RPCs rewritten to append-only semantics; RLS: INSERT for authenticated users, SELECT for own rows or admin.
- **`app/api/kyc/submit/route.ts`**: calls `submit_kyc` RPC, no direct INSERT.
- **`app/api/admin/kyc/review/route.ts`**: calls `review_kyc_submission` RPC, no direct UPDATE.
- Existing `app/api/kyc/upload/route.ts` is unaffected (storage upload, not status transitions).
