# Vendor Requirements Completion Design

## Goal

Complete the vendor requirements demo without deleting existing Supabase data. Preserve current orders, bookings, QR demo data, and customer flows while making outlet-scoped management explicit and adding representative data for all requirement branches.

## Confirmed decisions

- Existing Supabase rows must remain untouched; all demo expansion is additive and idempotent.
- Both `vendor_owner` and `outlet_manager` can manage product, pricing, and operating hours for their assigned outlet scope.
- Add multiple approved vendor owners so demo users can see meaningful vendor choices.
- Add quick entry points in the demo-account screen.
- Stripe remains demo mode; no real Checkout Session/webhook order gate is required.
- Digital products use a demo fulfilment/download URL rather than real file delivery.
- Add representative pending/rejected vendor states, BOGO vouchers, pricing rules, voucher redemptions, low-stock/out-of-stock cases, and mixed-cart/payment examples.

## Design

### Authorization

Keep the existing vendor authorization and outlet scope checks. Remove only the manager restrictions that conflict with the confirmed requirement. Product, variant, price-rule, outlet-hours, and outlet-page APIs must authorize the caller against the selected outlet, not merely the vendor. The UI will expose the same controls to both roles only for outlets they are assigned to.

### Shop pages

Keep the existing JSON block builder, desktop/mobile preview, and SEO fields. Normalize gallery and image block data at the API/customer-renderer boundary so saved `{ url, alt }` gallery objects and block image fields render consistently. Keep public outlet pages limited to approved vendors/outlets.

### Product, pricing, inventory

Keep Supabase as the source of truth. Add bundle product selection to the price-rule UI, keep atomic inventory decrement/auto-disable, and add an outlet-scoped low-stock alert panel that reacts to Supabase inventory changes. Seed digital product metadata through the existing product metadata path rather than adding a new delivery subsystem.

### Vouchers and analytics

Keep server-side validation and atomic redemption RPC. Make auto-generated codes collision-safe, improve CSV parsing for quoted fields, and seed all voucher types plus redemption rows so the existing vendor analytics page has real examples.

### Demo data

Extend the existing guarded remote seed script with stable deterministic IDs and upserts only. Add multiple vendors/owners, pending/rejected vendor examples, digital products, price rules, populated outlet pages, low-stock variants, BOGO vouchers, redemptions, and payments across the supported demo methods. Do not truncate, delete, or reset any table.

## Validation

- TypeScript, targeted ESLint, unit tests, production build.
- Read-only Supabase verification of counts and representative requirement rows before and after seeding.
- Confirm existing QR demo remains present for booking orders.
- Confirm existing order/image/paging work remains intact.
