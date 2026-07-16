# Commerce and Vendor Enhancement Design

## Goal

Strengthen the existing MyWisata commerce, booking, vendor onboarding, voucher, and outlet-builder flows without deleting existing features, tables, columns, or records.

## Non-destructive constraints

- Existing tables and records remain available.
- Schema changes are additive migrations only; new fields are nullable or have backward-compatible defaults.
- Existing payment methods remain visible unless an environment explicitly marks them as demo-only.
- Existing Stripe integration is reused, not replaced.
- Existing Shop Builder block editing, device preview, draft/published flow, autosave, undo, and redo remain intact.
- Existing status values are preserved and mapped rather than removed.

## Architecture

Checkout becomes a server-owned workflow. The browser requests a checkout session; PostgreSQL RPCs validate the authoritative cart, reserve inventory and booking capacity, create the order and payment row, and finalize the result idempotently. Stripe confirmation is handled by the existing integration and webhook, while non-Stripe methods use the same order/payment state machine.

Vendor onboarding extends the existing registration and approval flow with application metadata, private supporting documents, a `needs_information` state, and audit events. Customer recommendations gain invitation and claim states without changing existing recommendation records.

Shop Builder enhancements are additive: the current section editor remains the fallback, while the canvas gains richer layout primitives and per-device overrides.

## P0 design

1. Add checkout sessions, idempotency records, inventory holds, booking holds, and payment events.
2. Add `prepare_checkout`, `finalize_checkout`, and expired-hold release routines with authenticated ownership checks and a restricted search path.
3. Atomically update `booking_slots.booked` only when capacity remains.
4. Use the existing Stripe PaymentIntent and webhook; never trust a client-supplied paid status or total.
5. Add `vouchers.per_customer_limit` and centralize voucher validation.
6. Add the `service` product type without changing existing product types.

## P1 design

- Extend vendor applications with contact, legal, and document metadata; store documents in a private bucket with signed access.
- Add recommendation invitation/claim/conversion states and audit records.
- Reset content review status on approved content edits while leaving operational stock changes available.
- Add cross-outlet integrity constraints or triggers.
- Return row-level CSV validation results.
- Add voucher funnel events and unique-customer analytics.
- Preserve the current builder and add canvas containers, columns, resizing, alignment, copy/duplicate, and independent device overrides.

## P2 design

- Add refund/cancel/reschedule state transitions.
- Add secure digital download entitlements and expiring signed URLs.
- Add vendor brand pages and outlet switching.
- Add SEO preview, Open Graph, JSON-LD, sitemap, canonical URL, and draft noindex controls.
- Resolve Supabase RLS init-plan, duplicate-policy, index, storage, and privileged-function findings.

## Data repair policy

Existing over-capacity booking slots are reconciled and blocked from new sales until reviewed; bookings are not deleted. Orders without payment rows are marked as legacy/unreconciled or backfilled from verifiable seed data; payment success is never fabricated.

## Verification

- Concurrent checkout tests prove that capacity and inventory cannot be oversold.
- Retrying an idempotency key returns the original result without duplicate order, payment, voucher redemption, or hold.
- Stripe webhook replay is harmless.
- RLS prevents customers from reading KYC documents or other users' checkout records.
- Existing unit tests, TypeScript checks, and production build run after each phase.
