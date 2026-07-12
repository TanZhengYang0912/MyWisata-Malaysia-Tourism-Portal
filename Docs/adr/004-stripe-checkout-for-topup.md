# ADR-004: Stripe Checkout for customer top-up

**Status:** Accepted

## Decision

Customer wallet top-up uses Stripe-hosted Checkout (redirect flow) rather than Stripe Elements embedded in the app or a direct `PaymentIntent` created server-side.

## Rationale

Stripe-hosted Checkout offloads PCI compliance scope: no card data ever reaches the application server. Elements would require the app to handle raw card numbers in the browser and certify SAQ-A-EP compliance. Hosted Checkout also handles 3DS/SCA redirects, mobile payment methods, and localization automatically. The trade-off is less UI customization; for a top-up flow where the user is already leaving the page (redirect to Stripe, then back), this cost is negligible. The success/cancel return URLs (`?topup=success` / `?topup=cancel`) give the app enough signal to show appropriate banners without needing the full session object.
