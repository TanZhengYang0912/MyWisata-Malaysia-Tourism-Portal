# Localize Place and Nearby Metadata

**Status:** Complete

## Context

On the Chinese place page, the nearby-business category badge renders raw English database labels, the visible shop-link copy omits its `name` interpolation value, and the known Malaysian state name is rendered in its source language. Product, vendor, and place names are user-authored database content and have no locale-specific fields; they are explicitly outside this small UI repair.

## Decision and scope

- Translate only system-owned category and known Malaysian state labels.
- Pass the outlet name into the existing `nearbyOutlets.viewShop` interpolation for visible copy and accessibility text.
- Preserve user-authored and brand names verbatim until a separate approved translated-content data model exists.
- Do not change API responses, database schema, recommendation workflow, or product/vendor records.

## Files

- Create `lib/i18n/malaysia-states.ts` and `lib/i18n/__tests__/malaysia-states.test.ts` for a source-value-to-translation-key boundary.
- Modify `components/customer/nearby-outlets.tsx` and its existing contract test to translate category badges and supply the shop name.
- Modify `app/customer/place/[slug]/page.tsx` to localize its displayed known state label.
- Modify `app/i18n/locales/{en,zh-CN,ms}/customer.json` with identical `ui.malaysiaStates` key sets.

## TDD and verification

1. Added failing helper and component contracts for Perak, unknown-state fallback, translated category badge, and named shop link; observed the expected RED failures.
2. Added the smallest helper, locale resources, and component calls; focused tests pass.
3. `npm run verify:i18n`, `npx tsc --noEmit`, `npm test` (1,847 passing, 20 skipped), `npm run lint` (0 errors; 56 existing warnings), and `git diff --check` pass.

## Risks

- Unknown or vendor-entered states must fall back to their stored value rather than expose a missing translation key.
- Translation keys must remain identical across the three customer locale files.
