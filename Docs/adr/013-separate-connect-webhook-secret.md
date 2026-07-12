# ADR-013: Separate webhook secret for Stripe Connect events

**Status:** Accepted

## Decision

The platform uses two distinct webhook secrets: `STRIPE_WEBHOOK_SECRET` for regular Checkout/payment events (`/api/stripe/webhook`) and `STRIPE_CONNECT_WEBHOOK_SECRET` for Connect account events (`/api/stripe/connect-webhook`).

## Rationale

Stripe signs Connect account webhooks (triggered by events on connected accounts, e.g., `payout.paid` on a vendor's account) with a different secret from platform webhooks (triggered by events on the platform account, e.g., `checkout.session.completed`). A single secret would only work for one endpoint type. Using the wrong secret causes `stripe.webhooks.constructEvent` to throw, resulting in a 400 — which is better than silently processing the wrong event type. Keeping the secrets separate also enforces that each endpoint handles only its intended event category, preventing a `payout.paid` event from accidentally reaching the top-up handler or vice versa.
