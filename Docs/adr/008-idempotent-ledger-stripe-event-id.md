# ADR-008: Idempotent ledger via stripe_event_id UNIQUE constraint

**Status:** Accepted

## Decision

`wallet_transactions` has a `stripe_event_id` column with a `UNIQUE` constraint. Webhook handlers pass the Stripe event ID when inserting credit entries. A duplicate webhook delivery silently fails the INSERT (on conflict do nothing) rather than double-crediting the wallet.

## Rationale

Stripe guarantees at-least-once delivery for webhooks; duplicate deliveries within a short window are normal. Without idempotency, a transient network error that causes Stripe to retry a `checkout.session.completed` event would credit the wallet twice. The `UNIQUE` constraint is the simplest server-side guard: it requires no external state store, no explicit idempotency-key lookup table, and no changes to webhook handler logic — the database rejects the duplicate atomically. The constraint is on `(stripe_event_id)` rather than `(stripe_event_id, type)` because a single Stripe event should produce at most one ledger entry.
