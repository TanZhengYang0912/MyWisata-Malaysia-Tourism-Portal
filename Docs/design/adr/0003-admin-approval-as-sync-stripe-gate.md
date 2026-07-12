# Admin approval as synchronous gate for Stripe Transfer

**Status**: accepted

A Withdrawal request stays in `pending` state after User submission. When an admin clicks **Approve** in `/admin/withdrawals`, the request handler synchronously calls `stripe.transfers.create` (platform balance → Connect account) followed by `stripe.payouts.create` (Connect → bank). If either call fails, the row stays in `approved` state with a **Retry Payout** button rendered in the admin UI. On successful Stripe API acknowledgement the row transitions to `processing`; the `payout.paid` / `payout.failed` webhook resolves it to `paid` or `failed`. This keeps the human-review step our fraud/compliance defensive layer above the Stripe rail, and produces a demo narrative with four visible actors (customer → admin → Stripe → bank) instead of one silent auto-approval.

Full state machine:
```
pending    --(admin approve, Stripe call OK)--> processing
pending    --(admin approve, Stripe call fail)-> approved   (retry available)
pending    --(admin reject)-------------------> rejected
approved   --(admin retry, Stripe call OK)----> processing
processing --(webhook payout.paid)------------> paid
processing --(webhook payout.failed)----------> failed  (earnings_sen refunded)
```

## Considered Options

- **Auto Stripe call on User submit** (no admin step) — rejected. Removes the fraud/AML checkpoint, throws away the existing `/admin/withdrawals` UI, and produces a lifeless demo (button press → done, nothing to show).
- **Admin gate for high amounts only** (auto-approve below RM 500, admin review above) — rejected. Doubles the state machine surface, requires two test matrices, and creates ambiguity in incident response ("was this auto or manual?").
- **Async worker between approve and Stripe call** (approve emits a job, worker processes later) — rejected. Over-engineering for a two-week FYP; adds queue infrastructure with no observable improvement in the demo.
- **Two-person approval for all withdrawals** (reviewer + payer, distinct roles) — rejected. Bank-grade control that doesn't fit an FYP marketplace demo.

## Consequences

- `withdrawal_requests` state machine has six states; UI in `/admin/withdrawals` must render `approved` distinct from `processing` so the Retry button surfaces.
- Failure of `payout.failed` webhook must reverse the earnings debit via `credit_earnings` with `reason = 'stripe_payout_failed_refund'` — the ledger must remain internally consistent even when Stripe misbehaves.
