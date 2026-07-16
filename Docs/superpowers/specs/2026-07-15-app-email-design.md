# App Email Design

## Goal

Send transactional email notifications to each authenticated user's real email address after successful checkout/top-up and withdrawal state changes, using the project's Gmail SMTP account for the current FYP deployment.

## Constraints

- Gmail SMTP is the current provider; no custom domain is required for this phase.
- The Gmail App Password is server-only and must never be exposed as `NEXT_PUBLIC_*`, logged, or committed.
- Existing payment, wallet, KYC, Stripe Connect, and contributor modules remain behaviorally unchanged except for the smallest email event hooks required below.
- Existing unrelated working-tree changes, especially `app/api/admin/kyc/submissions/route.ts`, must remain untouched.
- Email failure must not roll back a successful payment, wallet credit, withdrawal reservation, approval, or payout.

## Architecture

The server uses a small `nodemailer` SMTP adapter in `lib/email/` and renders both HTML and plain-text templates. Durable email intent is written to an `email_outbox` table with a unique `event_key`; this prevents duplicate messages when Stripe retries webhooks or a status update is retried. A server-only sender claims pending rows, sends through Gmail SMTP, and records `sent` or `failed` with bounded retry metadata.

The Stripe webhook enqueues payment confirmation events after the existing wallet credit operation succeeds. Withdrawal submission is initiated by the existing client-side domain function, so it makes one best-effort call to a new authenticated server route after the existing RPC succeeds; the route verifies ownership, enqueues the event, and sends it. Admin withdrawal routes and the Connect webhook enqueue status events immediately after their existing state transitions. None of these hooks changes authorization or money movement. The event payload contains only transaction metadata needed by the template (amount, status, reference, timestamp); no KYC document data or secrets are included.

## Event contract

| event type | unique key | trigger |
| --- | --- | --- |
| `checkout_succeeded` | `stripe-checkout:<session_id>` | `checkout.session.completed` after existing fulfillment path |
| `topup_succeeded` | `stripe-topup:<event_id>` | `checkout.session.completed` after `credit_topup` |
| `withdrawal_submitted` | `withdrawal-submitted:<withdrawal_id>` | withdrawal request reaches `pending` |
| `withdrawal_approved` | `withdrawal-approved:<withdrawal_id>` | admin approval reaches `approved` |
| `withdrawal_paid` | `withdrawal-paid:<withdrawal_id>` | Connect payout completion reaches `paid`/`completed` |
| `withdrawal_failed` | `withdrawal-failed:<withdrawal_id>` | Connect payout failure reaches `failed` |

## Delivery behavior

- `to_email` is read from the authenticated user's `users.email`/Auth email at enqueue time.
- Invalid or missing recipient addresses create a failed outbox row and a server log with a redacted reason.
- A duplicate `event_key` is a no-op.
- Gmail SMTP uses `smtp.gmail.com`, port `587`, STARTTLS, and the App Password from environment variables.
- A server-only processing path is available for retrying failed rows; the authenticated withdrawal-submit route accepts only the current user's own withdrawal ID and cannot send arbitrary email.

## Verification

- Unit tests cover recipient selection, HTML/text rendering, event-key deduplication, redacted SMTP errors, and status-to-template mapping.
- Route/webhook tests verify payment events enqueue only after the existing database operation succeeds.
- SQL migration review verifies RLS prevents users from inserting or reading other users' outbox rows while the server can process them.
