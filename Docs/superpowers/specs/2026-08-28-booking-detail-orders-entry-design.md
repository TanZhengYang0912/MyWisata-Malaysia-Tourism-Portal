# Booking Detail Theme and My Orders Entry Design

## Context

The customer Booking Detail page still renders light-only surfaces in dark mode because it uses hard-coded white, slate background, slate border, and slate text utilities. Separately, customers can already view their complete order history through the existing `/customer/orders` route and the Orders tab inside My Activity, but the account menu does not expose that existing destination.

## Decisions

- Keep Booking Detail as the focused view for one itinerary booking and QR pass.
- Keep My Activity as the itinerary/calendar experience.
- Keep the existing My Orders implementation as the transaction history for purchases, bookings, payment status, receipts, refunds, and order details.
- Add an account-menu entry that links directly to `/customer/orders`; do not create another order page or data flow.
- Place My Orders first in the existing Payments & verification group, above My Vouchers.
- Localize the entry as `My Orders`, `我的订单`, and `Pesanan Saya`.
- Replace only Booking Detail's light-only colors with existing semantic theme tokens while preserving its layout and behavior.

## Booking Detail Theme

Update `app/customer/bookings/[id]/page.tsx` with these mappings:

- `bg-white` to `bg-card`
- `bg-slate-50/70` to `bg-secondary/50`
- `text-slate-500` and `text-slate-400` to `text-muted-foreground`
- `border-slate-100` to `border-border`

Do not change data loading, refund handling, QR rendering, printing, receipt navigation, layout, sizing, or translations.

## My Orders Reuse

Add one item to `ACCOUNT_MENU_GROUPS` in `lib/customer/header-navigation.ts`:

- Route: `/customer/orders`
- Icon: the existing `ReceiptText` icon
- Translation key: `accountItems.orders`

The account layout already renders this configuration, so `app/customer/layout.tsx` does not need modification. The existing `/customer/orders` page remains the single list implementation, and `/customer/orders/[id]` remains the single order receipt implementation.

## Testing

- Extend the existing Booking Detail contract test to reject light-only classes and require semantic theme tokens.
- Extend the existing header-navigation test to require `/customer/orders` in the account routes.
- Verify English, Simplified Chinese, and Malay account-menu translations.
- Run focused tests, TypeScript, lint, the full Vitest suite, and `git diff --check`.

## Scope Boundaries

In scope:

- Booking Detail theme colors.
- Account-menu discovery of the existing My Orders route.
- Three locale entries and focused regression tests.

Out of scope:

- New order pages, order models, APIs, migrations, checkout changes, My Activity behavior, booking behavior, QR behavior, refund behavior, or account-menu redesign.

## Dependencies and Database

- No new dependencies.
- No database or Supabase changes.

## Risks

- A broad class replacement could alter unrelated booking behavior; changes must stay limited to visual utilities.
- Linking to a new duplicate Orders implementation would create divergent behavior; the account menu must point to the existing `/customer/orders` route.
- Locale keys must be added consistently for all supported languages to avoid fallback English in the account menu.
