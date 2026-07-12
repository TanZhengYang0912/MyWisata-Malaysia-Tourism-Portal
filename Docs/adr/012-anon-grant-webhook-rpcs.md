# ADR-012: anon GRANT on webhook RPCs — Stripe signature as auth gate

**Status:** Accepted

## Decision

`credit_topup`, `connect_payout_completed`, `connect_payout_failed`, and `update_connect_status` are granted `EXECUTE` to the `anon` role (the Supabase anon key role). Webhook route handlers verify the `Stripe-Signature` header before calling any RPC.

## Rationale

Supabase webhook routes run in Next.js API handlers that use the anon Supabase client (no user session is present in a webhook context). Granting these RPCs to `authenticated` only would require embedding a service-role key in the webhook handler, which carries higher blast radius if leaked. The anon grant is safe because: (1) the Stripe signature check in the handler is the auth gate — an unsigned request never reaches the RPC; (2) the RPCs accept only Stripe-internal identifiers (`stripe_event_id`, `stripe_payout_id`) as parameters, so a caller without a valid Stripe event cannot produce meaningful input; (3) all RPCs are idempotent (UNIQUE constraint on `stripe_event_id`), so replay attacks are harmless.
