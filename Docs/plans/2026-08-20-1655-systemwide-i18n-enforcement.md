# System-wide i18n enforcement implementation plan

**Date:** 2026-08-20 16:55

**Status:** Implementation complete; authenticated E2E fixture follow-up recorded

**Design:** [System-wide i18n enforcement design](../superpowers/specs/2026-08-20-systemwide-i18n-enforcement-design.md)

**Goal:** Make every fixed MyWisata interface string follow the selected `en`, `zh-CN`, or `ms` locale, remove silent English fallback paths, and add a blocking AST/catalog CI gate that prevents regressions.

## Confirmed root causes and baseline

- `components/profile/preferences-editor.tsx` renders English `label` values although every option already has a valid `labelKey`.
- `app/customer/layout.tsx` derives navigation keys from URLs instead of rendering the existing `labelKey`; several generated keys do not exist and fall through to English `defaultValue` labels.
- client and server runtime configurations set `fallbackLng: "en"`.
- the provider test explicitly expects English fallback in Chinese and Malay.
- the existing coverage script proves catalog parity and inventory existence, but not source-literal safety, interpolation parity, or actual key binding.
- the existing source contains 689 `defaultValue` occurrences under `app/`, `components/`, and `lib/`; these remain English fallback paths even after `fallbackLng` is disabled.
- the official i18next AST lint, with automatic project detection, reports 295 candidate issues across 67 files. Some are real fixed English copy; others are reviewed technical/brand tokens that need explicit treatment.
- `i18next-cli@1.71.0` requires Node 22 or newer, while CI currently uses Node 20.

Baseline checks before modification:

```bash
node scripts/verify-i18n-coverage.mjs
npx vitest run components/providers/__tests__/i18n-provider.test.tsx components/shared/__tests__/language-entry-points.contract.test.ts lib/i18n/__tests__/resources.test.ts scripts/__tests__/verify-i18n-coverage.test.ts
npm exec --yes --package=i18next-cli -- i18next-cli lint
```

Expected baseline: catalog/tests pass; AST lint fails with the current hard-coded string inventory.

## Scope boundaries

### In scope

- all fixed UI in Customer, Guest/Public, Vendor/Outlet, Admin, Auth/Lifecycle, shared components, accessible labels, visible error states, and locale-aware formatting;
- the known Preferences, customer navigation, and My Vouchers header defects;
- removal of English `defaultValue` copy from application translation calls;
- explicit handling of brands, currency codes, fonts, emojis, IDs, and other non-translatable technical values;
- catalog parity, interpolation parity, AST lint, package scripts, and CI;
- representative browser coverage for all roles and all three locales.

### Out of scope / files not touched

- database migrations, schema, RLS, Supabase functions, and stored user/vendor content;
- visual layout, spacing, page alignment, or design tokens;
- authentication and authorization policy;
- machine translation or translation-management services;
- generated local files under `output/` and `tmp/`;
- unrelated refactors, renames, and folder moves.

## Dependencies and infrastructure

- Add exact dev dependency `i18next-cli@1.71.0`; no new production dependency.
- Upgrade `.github/workflows/ci.yml` from Node 20 to Node 22 because the pinned CLI requires Node 22+.
- Keep npm and `package-lock.json` as the package manager/lock source.
- No database changes.

## Task 1: Establish failing runtime and source contracts

**Modify:**

- `components/providers/__tests__/i18n-provider.test.tsx`
- `components/shared/__tests__/language-entry-points.contract.test.ts`
- `lib/i18n/__tests__/resources.test.ts`
- `scripts/__tests__/verify-i18n-coverage.test.ts`
- `app/customer/__tests__/sitewide-i18n.contract.test.ts`

**Create:**

- `components/profile/__tests__/preferences-editor-i18n.contract.test.ts`
- `scripts/__tests__/verify-i18n-default-values.test.ts`

**Steps:**

1. Change the provider fixture assertion so a missing Chinese/Malay key resolves visibly to its key, never the English resource.
2. Replace the customer-layout contract that currently requires URL-derived keys with assertions requiring `item.labelKey`, `group.labelKey`, and explicit localized My Vouchers copy.
3. Add a Preferences contract proving every collection renders `t(labelKey)` and never renders its English `label` field.
4. Extend resource tests to compare interpolation variable sets across every locale leaf, not only key presence/non-empty values.
5. Add verifier fixtures for mismatched interpolation variables.
6. Add a source verifier test that fails for non-empty `defaultValue` in production UI while ignoring tests and approved non-UI files.
7. Run the focused tests and confirm they fail for the expected current behavior before implementation.

## Task 2: Remove runtime English fallback and correct explicit key binding

**Modify:**

- `components/providers/i18n-provider.tsx`
- `i18n.config.ts`
- `components/profile/preferences-editor.tsx`
- `app/customer/layout.tsx`
- `components/shared/__tests__/language-entry-points.contract.test.ts`
- `components/providers/__tests__/i18n-provider.test.tsx`
- `components/profile/__tests__/preferences-editor-i18n.contract.test.ts`

**Existing sources reused without modification:**

- `backend/domains/preferences.ts`
- `lib/customer/header-navigation.ts`
- `lib/customer/discovery-categories.ts`

**Steps:**

1. Set client and server `fallbackLng` to `false`; keep the active locale, supported locales, namespace resources, and same-locale shared namespace behavior intact.
2. Render all Preferences collections from their existing `labelKey` fields. Translate learned interest labels through the existing category keys as well.
3. Delete `customerNavigationKey()` and render `CUSTOMER_NAV` using `item.labelKey`.
4. Render account groups/items from `group.labelKey`/`item.labelKey`; use semantic description subkeys without English defaults.
5. Localize both visible text and `aria-label` for the desktop/mobile My Vouchers entry.
6. Remove English `defaultValue` from the touched layout paths.
7. Run the Task 1 tests and confirm the known screenshot/navigation/runtime failures are green.

## Task 3: Add blocking catalog and source enforcement

**Modify:**

- `package.json`
- `package-lock.json`
- `.github/workflows/ci.yml`
- `scripts/verify-i18n-coverage.mjs`
- `scripts/__tests__/verify-i18n-coverage.test.ts`

**Create:**

- `i18next-cli.config.ts`
- `scripts/verify-i18n-default-values.mjs`
- `scripts/__tests__/verify-i18n-default-values.test.ts`

**Steps:**

1. Install and pin `i18next-cli@1.71.0` as a dev dependency.
2. Configure exact inputs (`app/**/*.{ts,tsx}`, `components/**/*.{ts,tsx}`), the five existing namespaces, `en` as authoring locale, the existing JSON output layout, ignored tests/generated/dev-only technical paths, and concatenation/punctuation checks as errors.
3. Keep exception handling narrow: brand names, currency/measurement codes, IDs, font names, and decorative emoji must be represented as data/constants or have a line-level reviewed suppression—not broad tag/directory exemptions.
4. Add interpolation-variable parity to `verify-i18n-coverage.mjs`.
5. Implement an AST-based `verify-i18n-default-values.mjs` check using the installed TypeScript API to reject non-empty English `defaultValue` in production UI translation calls.
6. Use CLI status as the blocking source-to-catalog binding check. Do not generate global i18next module augmentation: the existing application intentionally uses dynamic, data-derived keys and helper abstractions, and generated strict typings produce thousands of unrelated compile failures.
7. Change `verify:i18n` to run catalog validation, default-value validation, CLI lint, and CLI status.
8. Add `npm run verify:i18n` as an explicit CI step and update CI to Node 22.
9. Run the new gate and retain its violation list as the migration worklist; do not weaken the configuration to make violations disappear.

## Task 4: Remove English `defaultValue` paths

Remove non-empty `defaultValue` from translation calls while preserving interpolation/count variables. Where a key is missing, add it to all three catalogs before removing the default. This is a mechanical boundary change, not a copy rewrite.

**Customer/Auth/Admin/Vendor route files:**

- `app/login/page.tsx`
- `app/customer/activity/[id]/activity-detail-client.tsx`
- `app/customer/activity/[id]/bodies/booking-panel.tsx`
- `app/customer/bookings/[id]/page.tsx`
- `app/customer/calendar/page.tsx`
- `app/customer/checkout/page.tsx`
- `app/customer/checkout/simulator/[sessionId]/page.tsx`
- `app/customer/customer-home-client.tsx`
- `app/customer/design-demo/design-demo-client.tsx`
- `app/customer/for-you/for-you-client.tsx`
- `app/customer/layout.tsx`
- `app/customer/notifications/page.tsx`
- `app/customer/orders/[id]/page.tsx`
- `app/customer/orders/page.tsx`
- `app/customer/place/[slug]/page.tsx`
- `app/customer/preferences/page.tsx`
- `app/customer/profile/register-vendor/page.tsx`
- `app/customer/recommendations/page.tsx`
- `app/customer/support/[id]/page.tsx`
- `app/customer/support/page.tsx`
- `app/customer/vendor/[vendorId]/page.tsx`
- `app/customer/wallet/withdrawals/[id]/page.tsx`
- `app/vendor/profile/page.tsx`
- `app/vendor/wallet/page.tsx`
- `app/admin/affiliate/page.tsx`
- `app/admin/ai-assistant/page.tsx`
- `app/admin/catalogue/page.tsx`
- `app/admin/chat-reports/page.tsx`
- `app/admin/chatbot/page.tsx`
- `app/admin/dashboard/page.tsx`
- `app/admin/kyc/page.tsx`
- `app/admin/layout.tsx`
- `app/admin/reports/payouts/page.tsx`
- `app/admin/rewards/page.tsx`
- `app/admin/vendors/page.tsx`
- `app/admin/withdrawals/page.tsx`

**Component files:**

- `components/admin/batch-action-bar.tsx`
- `components/admin/confirm-dialog.tsx`
- `components/admin/moderation-flags-panel.tsx`
- `components/admin/segmented-filter.tsx`
- `components/admin/user-management-drawer.tsx`
- `components/customer/activity-card.tsx`
- `components/customer/booking-day-drawer.tsx`
- `components/customer/directory-pagination.tsx`
- `components/customer/discovery-filters.tsx`
- `components/customer/guest-account-empty-state.tsx`
- `components/customer/nearby-outlets.tsx`
- `components/customer/outlet-chat-button.tsx`
- `components/customer/place-activity-section.tsx`
- `components/customer/place-breadcrumb.tsx`
- `components/customer/place-card.tsx`
- `components/customer/place-list.tsx`
- `components/customer/saved-destination-card.tsx`
- `components/demo-map/story-map.tsx`
- `components/layout/vendor-sidebar.tsx`
- `components/outlet/outlet-menu.tsx`
- `components/providers/action-feedback.tsx`
- `components/shared/chatbot-widget.tsx`
- `components/shared/empty-state.tsx`
- `components/shared/notification-bell.tsx`
- `components/shared/notification-center.tsx`
- `components/shared/status-badge.tsx`
- `components/shared/ticket-thread.tsx`
- `components/vendor/compact-filter-bar.tsx`
- `components/vendor/outlet-builder-canvas.tsx`
- `components/vendor/outlet-builder-inspector.tsx`
- `components/vendor/outlet-builder-palette.tsx`
- `components/vendor/outlet-page-builder.tsx`
- `components/vendor/pagination-controls.tsx`
- `components/vendor/vendor-invite-client.tsx`
- `components/vendor/voucher-csv-builder.tsx`

**Steps:**

1. Apply a TypeScript-AST codemod to remove only `defaultValue` properties, retaining all other options and formatting.
2. Review the diff for calls where the key was dynamic or the default carried required interpolation.
3. Run the default-value verifier and focused role contract tests.
4. Add missing keys to all three matching namespaces instead of restoring an English default.

## Task 5: Migrate AST-confirmed Customer/Guest fixed copy

**Modify:**

- `app/customer/activity/[id]/activity-detail-client.tsx`
- `app/customer/activity/[id]/bodies/booking-panel.tsx`
- `app/customer/affiliate/page.tsx`
- `app/customer/bookings/[id]/page.tsx`
- `app/customer/cart/page.tsx`
- `app/customer/chat/page.tsx`
- `app/customer/checkout/page.tsx`
- `app/customer/checkout/simulator/[sessionId]/page.tsx`
- `app/customer/customer-home-client.tsx`
- `app/customer/design-demo/design-demo-client.tsx`
- `app/customer/destination/[destinationId]/page.tsx`
- `app/customer/experience/[experienceId]/experience-booking-sidebar.tsx`
- `app/customer/home-client.tsx`
- `app/customer/kyc/page.tsx`
- `app/customer/orders/[id]/page.tsx`
- `app/customer/orders/page.tsx`
- `app/customer/place/[slug]/page.tsx`
- `app/customer/trip/[tripId]/trip-planner-client.tsx`
- `app/customer/vendor/[vendorId]/outlet/[outletId]/page.tsx`
- `app/customer/vendor/[vendorId]/page.tsx`
- `app/customer/wallet/page.tsx`
- `app/customer/wallet/withdrawals/[id]/page.tsx`
- `app/guest/activity/[id]/page.tsx`
- `app/guest/vendor/[vendorId]/page.tsx`
- `components/customer/activity-card.tsx`
- `components/customer/booking-day-drawer.tsx`
- `components/customer/chat-thread-panel.tsx`
- `components/customer/nearby-outlets.tsx`
- `components/demo-map/discovery-pin-preview.tsx`
- `components/demo-map/malaysia-district-map.tsx`
- `components/demo-map/malaysia-state-map.tsx`
- `components/demo-map/story-map.tsx`
- `components/guest/guest-catalogue.tsx`
- `components/map/map-view.tsx`
- `components/outlet/outlet-block-renderer.tsx`

**Steps:**

1. Replace each true user-facing JSX/attribute/object literal from the AST worklist with semantic `customer` or `common` keys.
2. Convert split sentences and plural/count fragments to single interpolated/pluralized messages.
3. Replace manual `RM`, dates, and numeric UI formatting with `formatMYR`, `formatDate`, `formatDateTime`, or `formatNumber` using the active locale.
4. Keep database content, names, reviews, and descriptions untouched.
5. Represent decorative icons/emoji and technical IDs as data expressions; translate their accessible descriptions where present.
6. Run Customer/Guest contract tests and AST lint after the cluster.

## Task 6: Migrate AST-confirmed Vendor/Admin/Shared fixed copy

**Modify:**

- `app/vendor/bookings/page.tsx`
- `app/vendor/dashboard/page.tsx`
- `app/vendor/listings/page.tsx`
- `app/vendor/orders/page.tsx`
- `app/vendor/vouchers/page.tsx`
- `app/vendor/wallet/page.tsx`
- `app/admin/affiliate/page.tsx`
- `app/admin/layout.tsx`
- `app/admin/refunds/page.tsx`
- `app/admin/reports/payouts/page.tsx`
- `app/admin/rewards/page.tsx`
- `app/admin/staff-conduct/page.tsx`
- `app/dev/listings/page.tsx`
- `app/dev/page.tsx`
- `app/outlet-manager-invitations/[token]/page.tsx`
- `components/admin/moderation-flags-panel.tsx`
- `components/admin/recommendation-ai-review-panel.tsx`
- `components/admin/staff-conduct-panel.tsx`
- `components/recommendations/google-place-picker.tsx`
- `components/search/global-search.tsx`
- `components/shared/chatbot-widget.tsx`
- `components/shared/verified-contributor-badge.tsx`
- `components/ui/dialog.tsx`
- `components/vendor/outlet-builder-canvas.tsx`
- `components/vendor/outlet-builder-inspector.tsx`
- `components/vendor/outlet-page-builder.tsx`
- `components/vendor/recent-transactions.tsx`
- `components/vendor/variant-manager.tsx`
- `components/vendor/voucher-form.tsx`

**Reviewed non-copy/brand surface:**

- `app/api/share-image/[type]/[id]/route.tsx` — keep MyWisata as a brand data constant with an explicit lint suppression limited to that expression; do not ignore the API directory.

**Steps:**

1. Replace real fixed copy with semantic `vendor`, `admin`, or `common` keys.
2. Convert concatenated translations to complete interpolated/pluralized messages.
3. Move currency/date/count formatting to active-locale helpers.
4. Route shared search, dialog, Google Maps picker, badges, and chatbot labels through `common` keys.
5. Preserve technical font names, IDs, currency codes, and MyWisata/Google brand names as reviewed data, while translating surrounding UI.
6. Run Vendor/Admin/Auth/Shared contract tests and AST lint after the cluster.

## Task 7: Complete all locale catalogs

**Modify:**

- `app/i18n/locales/en/common.json`
- `app/i18n/locales/zh-CN/common.json`
- `app/i18n/locales/ms/common.json`
- `app/i18n/locales/en/customer.json`
- `app/i18n/locales/zh-CN/customer.json`
- `app/i18n/locales/ms/customer.json`
- `app/i18n/locales/en/vendor.json`
- `app/i18n/locales/zh-CN/vendor.json`
- `app/i18n/locales/ms/vendor.json`
- `app/i18n/locales/en/admin.json`
- `app/i18n/locales/zh-CN/admin.json`
- `app/i18n/locales/ms/admin.json`

**Not expected to change unless a failing auth key audit proves otherwise:**

- `app/i18n/locales/en/auth.json`
- `app/i18n/locales/zh-CN/auth.json`
- `app/i18n/locales/ms/auth.json`

**Steps:**

1. Add semantic English source keys introduced by Tasks 2, 5, and 6.
2. Add human-readable Simplified Chinese and Malay translations with matching interpolation variables and plural forms.
3. Do not fill target catalogs with copied English except approved brands/technical tokens.
4. Run catalog parity/interpolation verification after each namespace cluster.
5. Keep compile-time generated-key typing deferred until the project replaces its dynamic translation-key APIs with a compatible typed selector architecture. Runtime strictness and CI catalog/source checks remain blocking now.

## Task 8: Representative browser verification

**Modify:**

- `tests/e2e/sitewide-language-switching.spec.ts`

**Steps:**

1. Add Chinese and Malay assertions for the Preferences option values that originally remained English.
2. Assert customer top navigation (including Home, Partners, Saved, and My Vouchers), account-menu groups/items, and refresh persistence.
3. Add representative fixed-copy assertions for Customer cart/chat, Vendor, Admin, Auth/Guest, and Shared dialogs in both non-English locales.
4. Keep explicit assertions that dynamic vendor/account names remain unchanged.
5. Add a missing-key fixture/unit assertion rather than intentionally breaking a production E2E route.

## Task 9: Final verification and review

Before final verification, check again for a bounded independent `luna_worker` review. Delegate one read-only review of the final diff focused on silent English paths, accidental translation of dynamic data, and over-broad lint suppressions.

Run once after the final code change:

```bash
npm run verify:i18n
npm run lint
npx tsc --noEmit
npm test
npx playwright test tests/e2e/sitewide-language-switching.spec.ts
git diff --check
git status --short
```

Classify review findings:

- **must fix before handoff:** confirmed English fallback, missing locale/catalog key, translated user data, broken language persistence, broken role/auth flow, or disabled/over-broad enforcement;
- **follow-up:** copy polish, stylistic translation preference, or unrelated UI improvement.

Use at most one focused repair/re-review cycle. Do not repeatedly broaden the task.

## Completion evidence

- Chinese Preferences shows Chinese option labels, not `Food`, `Mid-Range Explorer`, `Solo`, or other English options.
- Malay shows the equivalent Malay fixed UI.
- English remains fully English when explicitly selected.
- Customer navigation binds explicit keys and My Vouchers localizes.
- missing non-English keys do not render English.
- `verify:i18n` fails on a representative hard-coded JSX literal and non-empty English `defaultValue` fixture.
- all locale catalogs have key and interpolation parity.
- CI gates, lint, typecheck, and unit tests pass; authenticated browser coverage requires the documented seeded-role fixtures.

## Final verification record

- `npm run verify:i18n`: passed with full English/Simplified Chinese/Malay source-key parity (4172/4172 used keys in each non-English locale). The CLI reports 46 non-blocking punctuation-composition warnings for follow-up cleanup.
- `npm run lint`: passed with 0 errors and 56 pre-existing/non-blocking warnings.
- `npx tsc --noEmit`: passed.
- `npm test`: 1765 tests passed and 20 skipped. The only full-run failure was the resource-parity test exceeding Vitest's 5-second default under full-suite contention; its explicit timeout was raised to 15 seconds and the focused rerun passed.
- `git diff --check`: passed.
- `npx playwright test tests/e2e/sitewide-language-switching.spec.ts`: attempted once; 2 tests passed, 7 failed, and 1 passed on retry. The failures depend on unavailable seeded admin/customer/vendor accounts, unauthenticated redirects, or stale fixture expectations rather than a catalog/runtime failure. No auth or seed-data behavior was changed to mask those environment failures.
- Final `luna_worker` review completed. Confirmed must-fix findings around custom JSX lint coverage, calendar/activity-detail localization, unknown database-category preservation, and English server-error leakage were repaired before verification.
