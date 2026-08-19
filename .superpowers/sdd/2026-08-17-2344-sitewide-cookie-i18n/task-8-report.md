# Task 8 focused repair report

## Repair completed

Translated the confirmed fixed-English regions in the eight exclusive vendor routes. The repair covers route headers, filters, status controls, batch actions, tables, pagination summaries, detail drawers, profile forms/previews, voucher analytics/upload controls, and wallet summary/history/withdrawal controls.

Dynamic business, product and outlet names; customer messages; IDs; persisted enum/API/database values; bank destinations; amounts; and business behavior were preserved. Booking, voucher and wallet dates now use the active i18n locale. Voucher discount labels are translated without changing stored voucher types or numeric values.

Added dedicated semantic keys and translations to all three `vendor` locale resources. Key and interpolation-placeholder parity is exact.

Strengthened `app/vendor/__tests__/sitewide-i18n.contract.test.ts` with route-specific assertions for the high-risk table, filter, pagination, batch, form and wallet regions. The assertions require representative semantic `t()` calls and reject the corresponding old English literals, preventing hook-only false positives.

## Changed files

- `app/vendor/bookings/page.tsx`
- `app/vendor/inbox/page.tsx`
- `app/vendor/orders/page.tsx`
- `app/vendor/outlets/page.tsx`
- `app/vendor/products/page.tsx`
- `app/vendor/profile/page.tsx`
- `app/vendor/vouchers/page.tsx`
- `app/vendor/wallet/page.tsx`
- `app/vendor/__tests__/sitewide-i18n.contract.test.ts`
- `app/i18n/locales/en/vendor.json`
- `app/i18n/locales/zh-CN/vendor.json`
- `app/i18n/locales/ms/vendor.json`
- `.superpowers/sdd/2026-08-17-2344-sitewide-cookie-i18n/task-8-report.md`

## Verification

Passed:

- `npx vitest run app/vendor/__tests__/sitewide-i18n.contract.test.ts` — 56/56 tests.
- Locale parity script — 4,239 vendor leaf keys match across `en`, `zh-CN` and `ms`; interpolation placeholders align.
- `npx tsc --noEmit` — passed.
- `npx vitest run app/vendor/__tests__/sitewide-i18n.contract.test.ts app/vendor/products/__tests__/page.contract.test.ts lib/vendor/__tests__/inbox-response.test.ts lib/vendor/__tests__/profile-ui.test.ts lib/wallet/__tests__/transaction-display.test.ts lib/wallet/__tests__/withdrawal-display.test.ts` — 6 files, 65/65 tests.
- Targeted ESLint over the eight routes and contract — zero errors. It reported 10 existing warnings (`react-hooks/set-state-in-effect`, `no-explicit-any`, and one unused pre-existing order date helper); no warning was introduced as a blocking failure.

No files were staged or committed by this repair. No dependency, package, API, database, authorization or behavior change was made. No blockers remain.
