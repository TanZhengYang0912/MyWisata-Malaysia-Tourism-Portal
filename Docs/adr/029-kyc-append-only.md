# ADR-029: KYC Submissions — Append-Only Event Log

**Status:** Amended
**Original migration:** `029_kyc_append_only.sql`
**Amendment:** `20260824221900_kyc_review_events.sql`

---

## Context

KYC review decisions (approve, reject, request resubmission) are compliance-sensitive: regulators and audit teams need to know not just the current status, but the full history of who reviewed what and when. A mutable-status design (`UPDATE kyc_submissions SET status = 'rejected'`) destroys intermediate states and is difficult to audit. The question is whether to model `kyc_submissions` as a mutable record or an append-only event log.

A secondary question: should the user's queue position (for pending review display) be computed at query time or stored?

---

## Decisions

### Mutable current snapshot plus append-only review evidence

The original ADR described `kyc_submissions` itself as an append-only event
log. That is not the architecture implemented by the hardened submission and
review RPCs: one submission row is updated from `draft` to `pending` and then
to its review state.

The amended model makes that distinction explicit:

- `kyc_submissions` is the mutable current snapshot for one document package;
- legal name, email and phone are captured on that row at submission start and
  protected from later mutation;
- `kyc_review_events` is the append-only compliance record for every review
  decision, including from/to status, action, actor, actor-role snapshot,
  structured reason, internal note, customer message and time;
- audit and notification writes remain in the same transaction as the state
  transition and review event.

This preserves the existing operational state machine without making the
incorrect claim that the mutable submission row is event-sourced.

### Review assignment

Pending submissions are claimed with a compare-and-set operation. A normal KYC
reviewer may decide only a submission assigned to them; a super-admin may
override an assignment. Decisions identify both `submission_id` and `user_id`
so an older detail page cannot accidentally decide a newer submission.

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

### Triggers are integrity guards only

State transitions remain explicit SECURITY DEFINER RPC calls. Triggers are
used only to reject mutation/deletion of immutable review events and legal
identity snapshot fields; they do not perform workflow transitions.

---

## Scope

- **Migration**: current submission snapshot, immutable legal identity fields,
  append-only `kyc_review_events`, assignment CAS and atomic review RPC.
- **`app/api/kyc/submit/route.ts`**: calls `submit_kyc` RPC, no direct INSERT.
- **`app/api/admin/kyc/review/route.ts`**: calls `review_kyc_submission` RPC, no direct UPDATE.
- Existing `app/api/kyc/upload/route.ts` is unaffected (storage upload, not status transitions).
