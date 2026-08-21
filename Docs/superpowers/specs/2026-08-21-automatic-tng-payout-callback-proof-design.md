# Automatic TNG Mock Payout Callback and Settlement Proof Design

**Date:** 2026-08-21

**Status:** Approved design

**Research:** `docs/research/2026-08-21-open-source-payout-lifecycle.md`

## Context

MyWisata currently moves an approved non-production TNG withdrawal to `processing`, creates an opaque provider payout ID, and then waits for `POST /api/tng/payout/webhook`. No component sends that callback automatically, so a valid withdrawal remains in `processing` indefinitely even though the mock provider accepted it.

The desired behavior follows the mature payout pattern used by Open Collective, BTCPay Server, Saleor, and Medusa: an administrator approves once, the provider executes asynchronously, and a verified provider result moves the withdrawal to a terminal status. Provider proof and ledger movement must be visible without giving either the administrator or customer a second way to approve or directly mark a payout as paid.

## Goals

1. After the only Admin approval, automatically complete the non-production TNG mock lifecycle through a provider-shaped signed callback.
2. Preserve `processing` as the factual state between payout submission and provider confirmation.
3. Make callback delivery durable and retryable rather than dependent on a browser or in-memory timer.
4. Reuse the existing signature verification, provider-ID checks, idempotent settlement RPC, balance movement, audit, notification, and email paths.
5. Show Customer-readable money movement and Admin-readable technical settlement proof.
6. Provide reconciliation for callbacks that are delayed or missed.

## Non-goals

- No live TNG Direct Credit integration or claim of production TNG readiness.
- No second Admin approval, `Mark paid` button, or Customer-controlled paid status.
- No direct client or mock-provider update of `withdrawal_requests`, wallet balances, or ledger rows.
- No TNG PIN, raw phone number, raw DuitNow value, webhook secret, or raw callback body in proof views.
- No Customer `I received the money` acknowledgement in this scope. Such an acknowledgement could be added later as a separate, non-authoritative record.
- No redesign of Stripe payout behavior.

## Authoritative State Model

| State | Authority | Meaning |
|---|---|---|
| `approved` | Admin approval RPC | Governance checks passed and payout is authorized. |
| `processing` | Provider submission RPC | An opaque provider payout ID exists and MyWisata is waiting for the provider result. |
| `paid` | Verified provider callback or reconciliation | Provider reported success; Reserved funds moved to Withdrawn atomically. |
| `failed` | Verified provider callback or reconciliation | Provider reported failure; Reserved funds returned to Earnings atomically. |

There is no additional `waiting_callback` database status. `processing` is the waiting-for-provider state. A provider `completed` result, if ever accepted as an alias, normalizes to MyWisata's terminal `paid` status.

## Approved Architecture

### 1. Atomic processing and callback-outbox creation

When the configured non-production TNG mock provider accepts a payout, a service-role-only database function atomically:

1. verifies that the withdrawal is approved and governance requirements remain satisfied;
2. records the opaque TNG payout ID;
3. moves the withdrawal to `processing`;
4. inserts one idempotent pending job into a dedicated TNG mock callback outbox.

The outbox row contains only safe routing data: withdrawal ID, provider payout ID, deterministic event key, desired mock outcome, availability time, attempts, processing status, and a redacted last error. It never stores the secret, signature, destination input, or raw callback body.

The default mock outcome is `paid`. A `failed` outcome is available only to automated test fixtures or a server-side test configuration; it is not exposed in Customer or Admin UI.

### 2. Durable automatic callback delivery

After the Admin response commits, a best-effort post-response processor accelerates delivery so the normal local/staging experience reaches `paid` in approximately 3–5 seconds. This accelerator is not the source of truth: the durable outbox remains pending if the process stops.

A protected recurring processor claims due jobs using `FOR UPDATE SKIP LOCKED`, bounded batches, and an attempt limit. It constructs the existing strict TNG payload, signs the exact raw body with the server-only mock webhook secret, and sends it through the same webhook verification and settlement boundary used by externally delivered callbacks.

Successful delivery marks the outbox job delivered. A retryable failure stores only a safe error code and schedules a bounded backoff. A non-retryable signature, provider-ID, amount, or state conflict is retained for reconciliation and surfaced to Admin without changing balances.

### 3. Webhook settlement remains authoritative

The webhook continues to:

1. reject production mock mode;
2. verify the HMAC signature against the exact raw body;
3. strictly validate the payload;
4. match withdrawal ID, provider, provider payout ID, amount, and currency;
5. enforce event idempotency;
6. call the governed provider settlement RPC;
7. enqueue notification/email only after a successful, non-idempotent settlement.

The callback payload and provider-event receipt gain safe proof fields: amount in sen, `MYR` currency, provider occurrence time, event ID, payout ID, status, and payload SHA-256. The raw body and signature are never persisted.

### 4. Reconciliation fallback

The recurring processor also identifies non-terminal TNG mock withdrawals that have a provider payout ID but no delivered terminal event. It recreates or releases the deterministic outbox job and reuses the same callback delivery path.

For a future live TNG adapter, reconciliation will query the provider by payout ID and feed the returned provider status into the same idempotent settlement service. It will not synthesize a successful live result.

## Success Data Flow

```text
Admin Approve (once)
  -> governance approval is recorded
  -> mock provider creates opaque payout ID
  -> atomic DB function: processing + callback outbox
  -> post-response worker claims job after short delay
  -> worker builds and signs canonical paid callback
  -> existing TNG webhook verifies signature and IDs
  -> settlement RPC records append-only provider event
  -> Reserved Earnings -RM50
  -> Withdrawn Earnings +RM50
  -> withdrawal_complete ledger row
  -> withdrawal status = paid
  -> paid notification/email queued exactly once
  -> Customer/Admin proof projections show the result
```

## Failure Data Flow

```text
Test-only failed provider callback
  -> existing TNG webhook verifies signature and IDs
  -> settlement RPC records append-only failed event
  -> Reserved Earnings -RM50
  -> Available Earnings +RM50
  -> withdrawal_cancel/reversal ledger row
  -> withdrawal status = failed
  -> normalized provider failure stored
  -> failure notification/email queued exactly once
```

Failure simulation exists to verify financial recovery, not to add another approval action.

## Settlement Proof Model

The existing append-only `payout_provider_events` record is the provider receipt. A safe, authorization-aware database projection returns proof only when the authenticated user owns the withdrawal or is an authorized Wallet approver.

The projection exposes:

- provider display name;
- masked/opaque provider payout reference;
- provider event ID;
- provider event status;
- amount and currency;
- provider occurrence time and MyWisata receipt time;
- `signatureVerified: true`, because no event reaches the receipt table before verification;
- payload SHA-256, not the payload;
- callback idempotency/delivery information that is safe to expose;
- related reserve and completion/reversal ledger transaction IDs, types, buckets, directions, amounts, and timestamps.

It does not expose webhook secrets, signatures, raw payloads, destination provider references, raw destination values, service keys, internal errors, or data belonging to another user.

## Customer Experience — Approved Layout A

The existing withdrawal receipt page shows:

1. withdrawal amount, destination, and terminal status;
2. a money-movement card:
   - before provider success: RM50 in Reserved;
   - after provider success: `Reserved -RM50 -> Withdrawn +RM50`;
   - after provider failure: `Reserved -RM50 -> Earnings +RM50`;
3. a settlement timeline:
   - withdrawal requested;
   - Admin approved and payout submitted;
   - provider callback verified;
   - ledger settlement completed;
4. a read-only payout proof card with masked reference, event ID, verification badge, received time, and shortened payload hash;
5. a statement that provider proof confirms the provider-reported result and cannot be edited by Customer or Admin.

The Wallet summary continues to show the authoritative bucket totals. The receipt makes the delta explicit so the Customer can see exactly where RM50 moved.

## Admin Experience — Approved Layout A

The withdrawal detail panel shows:

1. `No further Admin action required` after automatic settlement;
2. provider name, payout ID, event ID, event status, received time, verification state, payload hash, and duplicate-safe result;
3. immutable audit timeline from Admin approval through outbox creation, callback acceptance, atomic ledger settlement, and notification enqueue;
4. money-ledger evidence linking `withdrawal_reserve` to `withdrawal_complete` or reversal;
5. safe callback delivery/reconciliation errors when a job cannot complete.

There is no `Simulate Paid`, `Mark Paid`, or second `Approve` control in the ordinary Admin flow.

## Idempotency and Concurrency

- One deterministic outbox event key exists per withdrawal, provider payout ID, and outcome.
- Callback event IDs are deterministic and unique per provider result.
- Claiming uses row locks and `SKIP LOCKED` so concurrent workers cannot deliver the same pending row as separate jobs.
- The existing `(provider, event_id)` uniqueness and settlement row lock remain the final double-spend defenses.
- Duplicate success responses do not repeat balance movement, ledger rows, audit rows, notifications, or email.
- A late failure/refund after a successful event is handled only by an explicitly supported reversal transition; it must never silently overwrite `paid`.

## Retry and Stuck-Processing Behavior

- Immediate post-response delivery is best effort and never blocks the Admin response.
- Retryable delivery failures use bounded exponential backoff.
- The protected recurring processor retries due jobs and reconciles missing jobs.
- Attempt exhaustion leaves the withdrawal in `processing`, preserves Reserved funds, and exposes an Admin reconciliation warning.
- No retry path invents a successful callback or directly mutates financial tables.
- Processing age is measured and logged so operational monitoring can alert on stale payouts.

## Security and Privacy

- Mock mode remains disabled whenever `NODE_ENV=production` or required server-only configuration is missing.
- Callback outbox and provider-event tables are inaccessible directly to browser roles.
- All mutations use service-role-only functions with fixed `search_path` and explicit grants.
- Customer proof is ownership-scoped at the database query boundary.
- Admin proof requires the existing Wallet approver authorization.
- HMAC comparison remains constant-time.
- Only safe normalized error codes/messages are stored or returned.
- Logs redact secrets, signatures, raw destination values, and raw callback bodies.

## Error Handling

| Condition | Result |
|---|---|
| Invalid signature | Reject callback; no DB settlement; retain/retry outbox as appropriate. |
| Unknown withdrawal | Reject callback; no financial mutation. |
| Provider or payout ID mismatch | Reject and mark job for reconciliation; preserve Reserved funds. |
| Amount or currency mismatch | Reject and mark non-retryable reconciliation conflict. |
| Duplicate event | Return idempotent success; perform no duplicate side effects. |
| Temporary route/database error | Retry from durable outbox with backoff. |
| Attempts exhausted | Keep `processing`; show Admin reconciliation warning. |
| Verified provider failure | Atomically return Reserved to Earnings and mark `failed`. |

## Testing Strategy

### Unit and route tests

- mock provider defaults to paid callback scheduling only outside production;
- callback body/signature is deterministic and altered bodies fail verification;
- callback outbox insert and claim are idempotent;
- automatic paid delivery passes through the real webhook handler;
- test-only failed delivery passes through the same handler;
- invalid signature, provider ID, amount, and currency never settle;
- duplicate callback returns idempotent success;
- retry/backoff and attempt exhaustion preserve the correct status.

### Database contract and integration tests

- processing transition and outbox insertion are atomic;
- claim function is service-role-only and concurrency-safe;
- provider event receipt is append-only;
- success moves Reserved to Withdrawn exactly once;
- failure returns Reserved to Earnings exactly once;
- ledger, audit, notification, and proof rows agree on amount, withdrawal, provider IDs, and status;
- proof projection enforces Customer ownership and Wallet approver access.

### UI contract and browser verification

- Customer receipt renders Layout A money movement, timeline, and safe proof;
- Admin detail renders callback and ledger evidence without a second approval control;
- automatic refresh/polling replaces `processing` with `paid` without a page reload loop;
- failed proof shows the reversal path;
- multilingual labels exist for English, Malay, and Simplified Chinese.

### Final verification

- focused payout, webhook, Wallet, receipt, and Admin withdrawal tests;
- financial test suite;
- `npm run lint`;
- `npx tsc --noEmit`;
- one focused security/privacy review of service-role RPC grants, proof authorization, callback secrets, and internal storage paths;
- one real local/staging acceptance run proving `approved -> processing -> paid`, balances, ledger, proof, notification, and duplicate callback behavior.

## Operational Notes

- Mock success latency is a target, not a financial guarantee; the UI must remain correct if it takes longer.
- Reconciliation is required even after a live provider is introduced because webhooks can be delayed, duplicated, or lost.
- `paid` means the provider reported the payout sent/settled. It does not claim independent confirmation that the recipient's bank or eWallet credited the funds.
- A future recipient acknowledgement must be modeled separately and must not alter provider proof or settlement accounting.

## Acceptance Criteria

1. One Admin approval is the only business approval required.
2. A configured non-production TNG mock withdrawal automatically reaches `paid` through a verified signed callback, normally within approximately 3–5 seconds.
3. Closing the browser or losing the immediate worker does not lose the callback job; reconciliation completes it later.
4. Customer and Admin can see the approved Layout A proof without access to secrets or other users' data.
5. RM50 visibly and atomically moves from Reserved to Withdrawn on success, or back to Earnings on verified failure.
6. Duplicate, invalid, mismatched, delayed, and failed events cannot double-settle or corrupt balances.
7. Production cannot enable or invoke the mock payout/callback path.
