# Provider Simulator Payment Engineering Design

**Status:** Approved design pending written-spec review

**Date:** 2026-08-17

## Context

MyWisata cannot currently obtain production TNG eWallet, GrabPay, bank-transfer, or TNG Direct Credit API access. The project must not claim that simulated money movement is a live provider integration. It should nevertheless demonstrate the complete engineering boundaries of a production payment system so that a future provider integration replaces only the transport adapter.

The repository already has Stripe Sandbox checkout and top-up, atomic MyWisata Wallet settlement, checkout reservations, payment event storage, provider-neutral withdrawal work, and a signed non-production TNG payout simulator. The principal checkout gap is that the browser can currently call the generic checkout finalization endpoint with a successful outcome for external payment methods. That is not an acceptable provider-confirmation boundary and could also be abused to mark a pending Stripe order as paid.

## Goals

- Keep Stripe Sandbox as the real external sandbox integration for card top-up and order payment.
- Keep MyWisata Wallet settlement atomic and server-calculated.
- Implement asynchronous, provider-shaped simulators for TNG eWallet checkout, GrabPay checkout, and bank-transfer checkout.
- Require trusted server confirmation for every external payment method.
- Record provider-specific, idempotent, payload-bound payment events.
- Simulate provider refunds without marking a refund successful before the provider event is accepted.
- Demonstrate successful, failed, cancelled, pending, expired, replayed, conflicting, and refunded flows through automated tests.
- Preserve the existing signed non-production TNG withdrawal simulator and verify it as part of the end-to-end payment story.

## Non-goals

- Live TNG eWallet, GrabPay, bank-transfer, FPX, DuitNow, or TNG Direct Credit connectivity.
- TNG or GrabPay wallet top-up.
- Merchant onboarding or attempts to bypass provider KYB requirements.
- Storage of PINs, OTPs, complete bank account numbers, card details, or provider identity documents.
- Changes to Vendor registration, KYC document handling, Guest Mode, recommendation, map, chat, or unrelated UI.
- A separately deployed fake-payment service.

## Chosen Approach

Build an in-application asynchronous Payment Provider Simulator behind the same provider boundary intended for a future live adapter. This provides materially better fidelity than client-driven demo buttons without adding a second deployed service.

The rejected alternatives are:

1. Keep direct browser finalization and add only labels. This remains insecure and does not exercise real provider boundaries.
2. Deploy an independent fake-provider service. This offers slightly greater network realism but adds disproportionate deployment, secret, and availability overhead for the FYP.

## Provider Model

The checkout domain distinguishes the payment method selected by the customer from the provider that confirms the payment.

| Customer method | Provider | Confirmation authority |
|---|---|---|
| Stripe card | `stripe` | Stripe API/Webhook after server-side retrieval or signature verification |
| Wallet split | `stripe` plus Wallet reservation | Stripe API/Webhook and database reservation logic |
| MyWisata Wallet | `platform_wallet` | Authenticated server route and atomic database function |
| TNG eWallet simulator | `tng_ewallet_simulator` | Signed simulator event |
| GrabPay simulator | `grabpay_simulator` | Signed simulator event |
| Bank transfer simulator | `bank_transfer_simulator` | Signed simulator event representing funds received or rejected |

The existing database payment method `ewallet` remains compatible. A validated provider field differentiates TNG from GrabPay without widening all order constraints. Bank transfer continues to use `bank_transfer`. Provider selection becomes part of the normalized checkout request and idempotency hash.

## Provider Adapter Boundary

A focused payment-provider module owns provider mapping and simulator behavior. Its external-checkout interface must be small enough for a live provider implementation to replace the simulator later:

- create a provider session from the authoritative checkout session, amount, currency, and customer reference;
- expose an opaque provider payment reference and a redirect/action URL;
- normalize signed provider events into a bounded domain event;
- create a provider refund attempt;
- never expose signing secrets or raw sensitive provider data to the browser.

Provider session references and event references are opaque. Simulator generation is deterministic only where tests require repeatability; it must not derive a raw phone number, identity number, or bank account value into a stored reference.

## Checkout Data Flow

1. An eligible authenticated customer calls checkout preparation with selected cart keys, voucher, payment method, provider selection, and an idempotency key.
2. Existing database logic authoritatively calculates and reserves inventory, booking capacity, vouchers, and Wallet split funds.
3. Stripe creates a Stripe Checkout Session. A simulated external provider creates an opaque simulator payment session. Wallet-only checkout requires no external provider session.
4. The application records `requires_action` for external methods and returns only the redirect/action URL and safe display fields.
5. The simulator page clearly displays `Sandbox / Simulated — no real money moves`. It may request success, failure, or cancellation in non-production; a bank-transfer simulator may remain pending until `funds_received` is requested.
6. The simulator action endpoint checks environment, authentication, ownership, provider/session match, amount, currency, and current status. It creates a canonical event body and an HMAC signature server-side. No signing secret reaches the client.
7. The shared event processor verifies the raw body and signature, validates the normalized event, and calls a service-role-only provider-settlement RPC.
8. The RPC locks the checkout and event identity, verifies the provider-to-method mapping and payload hash, and finalizes the existing order/payment/reservations atomically.
9. Notifications, receipt generation, Affiliate attribution, and Vendor order events run only after a successful, non-replayed transition.

## Trusted Settlement Boundary

A forward-only database migration introduces a service-role-only provider settlement function. It accepts checkout session ID, provider, outcome, provider payment ID, provider event ID, and payload hash. It validates all external confirmation inputs before invoking the existing atomic checkout finalization behavior.

The existing authenticated finalization entry point is replaced or wrapped so that:

- authenticated customers may request Wallet settlement because the database calculates the amount and performs the debit;
- authenticated customers may report Wallet cancellation/failure where appropriate;
- Stripe card, Wallet split, TNG simulator, GrabPay simulator, and bank-transfer success require service-role confirmation;
- caller-supplied provider payment IDs and provider event IDs are never trusted from a customer request.

`payment_events` records the actual provider instead of hard-coding `stripe`. A repeated `(provider, provider_event_id)` with the same payload and target is an idempotent success. Reusing the key with a different payload, checkout session, amount, currency, or outcome is a conflict.

## State Machine

Checkout sessions retain the existing terminal states and enforce forward-only transitions:

- `pending_payment -> requires_action`
- `pending_payment/requires_action -> paid`
- `pending_payment/requires_action -> failed`
- `pending_payment/requires_action -> cancelled`
- `pending_payment/requires_action -> expired`

Terminal sessions cannot be resurrected. An identical callback to a terminal session returns an idempotent result; a conflicting callback is rejected and audited. The existing expiry process releases held inventory, booking capacity, voucher usage, and Wallet split reservations.

Provider event names are bounded, for example `payment.succeeded`, `payment.failed`, `payment.cancelled`, `payment.expired`, `refund.succeeded`, and `refund.failed`. Raw provider payloads are not stored; only a cryptographic payload hash and normalized bounded metadata may be retained.

## Simulator Availability

Simulator routes fail closed unless all of these conditions are true:

- `NODE_ENV` is not `production`;
- an explicit payment simulator mode is enabled;
- a simulator webhook secret is configured.

Production builds may contain the code but cannot create or complete simulator sessions. Checkout UI hides unavailable simulated methods. Stripe and Wallet remain independent of simulator configuration.

## Refund Flow

Customer refund requests and Admin approval remain governed by the existing refund workflow.

- Wallet refunds continue through the existing atomic Wallet refund RPC.
- Stripe Sandbox refunds continue through Stripe and use an idempotency key derived from the refund ID.
- TNG, GrabPay, and bank-transfer simulator refunds create an opaque provider refund attempt and remain non-terminal until a signed `refund.succeeded` or `refund.failed` event is processed.
- Provider failure leaves the refund retryable and does not mark the payment or order refunded.
- A successful event updates refund, payment, and order state once and records its provider event and audit reference.

## Error Handling and Privacy

- Signature mismatch, invalid JSON, unsupported event, provider mismatch, amount/currency mismatch, and missing session return safe errors without leaking secrets.
- Logs contain provider/event/session references but no raw secret, PIN, OTP, complete account number, or full signed body.
- Browser responses never return the simulator signing secret or internal Supabase storage paths.
- Provider errors are normalized to bounded categories and safe messages.
- External side effects use deterministic idempotency keys.
- Notification or email failure cannot roll back a successfully settled payment, and retry must not resend a customer-visible notification for an idempotent replay.

## User Experience

Checkout lists TNG eWallet and GrabPay separately while retaining the existing database `ewallet` method. Every simulator screen and result states that it is non-production and moves no real money.

- TNG and GrabPay show a simulated QR/deep-link action and outcome controls.
- Bank transfer shows a fictitious payment reference and remains pending until the simulator reports funds received, rejected, cancelled, or expired.
- The order is not displayed as paid until the server accepts the provider event.
- Failure and cancellation return the customer to a recoverable Checkout/Order state with an accurate message.

## Testing Strategy

Implementation follows test-driven development at the following seams:

1. Provider mapping and availability tests.
2. Canonical payload signing, signature verification, safe parsing, and tamper tests.
3. Route tests for ownership, non-production gating, amount/currency/provider matching, and secret non-disclosure.
4. Migration contract and isolated-database tests for external-confirmation authorization, state transitions, replay idempotency, conflicting events, and reservation integrity.
5. Refund adapter and event-processing tests.
6. Existing Stripe, Wallet, checkout, withdrawal, ledger, and refund regression tests.
7. Playwright journeys for TNG success, GrabPay failure, bank pending-to-paid, cancellation, expiry, refund, and Stripe/Wallet regression.

A single focused `luna_worker` final review checks the new routes, RPC grants, webhook privacy, sensitive-data exposure, and production fail-closed behavior. Confirmed authorization, privacy, data-loss, broken core-flow, or requirement violations are must-fix; other findings are recorded as follow-up.

## Documentation and Demonstration Claim

Project UI, README, and proposal evidence must describe these methods as `Sandbox` or `Simulated`. The valid demonstration claim is:

> MyWisata implements a provider-ready asynchronous payment architecture with signed callbacks, idempotent settlement, atomic reservations, governed refunds, audit records, and automated end-to-end tests. Stripe runs in its official sandbox. TNG eWallet, GrabPay, bank transfer, and TNG payout use non-production simulators pending merchant approval and production API access.

The project must never claim that simulator output proves live TNG, GrabPay, bank, or payout connectivity.
