# Profile City Autocomplete Implementation Plan

**Status:** Implemented; deployment and browser design QA blocked pending migration/import
**Approved direction:** Internal GeoNames-backed catalogue; Google is not Profile master data.

## Context and decisions

Profile location must support international users, multilingual city lookup, manual fallback, and stable persistence. The implementation will preserve `users.city`/`users.country` while adding a provider-neutral internal reference. Profile completion and capabilities remain unchanged.

## Exact file map

### Create

- `supabase/migrations/20260830123000_profile_location_catalogue.sql`
- `supabase/migrations/__tests__/20260830123000_profile_location_catalogue.test.ts`
- `scripts/import-geonames-cities.mjs`
- `scripts/lib/geonames-cities.mjs`
- `scripts/lib/geonames-cities.test.mjs`
- `lib/location/countries.ts`
- `lib/location/city-types.ts`
- `lib/location/__tests__/countries.test.ts`
- `app/api/locations/cities/route.ts`
- `app/api/locations/cities/__tests__/route.test.ts`
- `components/profile/country-combobox.tsx`
- `components/profile/city-autocomplete.tsx`
- `components/profile/profile-location-fields.tsx`
- `components/profile/__tests__/profile-location-fields.test.ts`
- `components/profile/__tests__/profile-sections.test.ts`

### Modify

- `package.json`
- `lib/validation/profile-schemas.ts`
- `app/api/profile/identity/route.ts`
- `app/api/profile/update/route.ts` — reject canonical metadata on the legacy endpoint so it cannot silently discard `cityId`
- `app/api/profile/me/route.ts`
- `lib/profile/profile-summary.ts`
- `lib/profile/__tests__/profile-summary.test.ts`
- `backend/core/types.ts`
- `app/customer/profile/page.tsx`
- `components/profile/profile-sections.tsx`
- `app/customer/profile/__tests__/profile-completion.test.ts`
- `app/customer/__tests__/sitewide-i18n.contract.test.ts` only if its explicit inventory requires it
- `app/i18n/locales/en/customer.json`
- `app/i18n/locales/zh-CN/customer.json`
- `app/i18n/locales/ms/customer.json`
- this plan (checklist/evidence only)

### Not touched

Recommendation/Vendor location flows; Phone/KYC/Entitlement/Affiliate/Checkout/Wallet/Admin; unrelated dirty files; existing Profile completion predicates beyond compatible string persistence.

### Dependencies and database

- New npm dependencies: none.
- Database: one additive catalogue migration, three additive `users` columns, two bounded security-definer RPCs, and no direct customer catalogue-table access.
- Operational data: opt-in GeoNames import using existing `pg`; no network work in migrations or app startup.

## Phase 1 — Database and importer (TDD)

- [x] Write migration contract tests first.
- [x] Add `location_cities`, country/search indexes, RLS, bounded authenticated search/resolve RPCs, and user metadata columns.
- [x] Ensure customers cannot directly read, insert, update, or delete catalogue rows.
- [x] Write importer parser/batch tests first.
- [x] Add streaming GeoNames `cities1000.zip` importer with explicit `DATABASE_URL`, temp cleanup, upsert, progress counts, and no secret/query logging.
- [x] Add `npm run import:geonames-cities`.
- [x] Verify migration and importer tests.

## Phase 2 — Server contracts (TDD)

- [x] Add country utilities and tests for 249 codes, localized labels, canonical English names, Malaysia default, and legacy matching.
- [x] Add authenticated city search route tests for validation, five-result limit, safe result projection, and database failure.
- [x] Implement the city search route using the RPC.
- [x] Extend `identitySchema` with nullable UUID `cityId` and validated `countryCode`.
- [x] Add Profile identity route tests for canonical catalogue resolution, country mismatch rejection, manual fallback, stale legacy metadata, and safe errors.
- [x] Extend Profile summary fields/query/mapping with `cityId`, `countryCode`, and `citySource`.
- [x] Verify affected server/profile tests.

## Phase 3 — Shared Profile UI (TDD)

- [x] Add controlled location component tests before implementation.
- [x] Implement accessible searchable `CountryCombobox`.
- [x] Implement debounced `CityAutocomplete` against `/api/locations/cities`, with stale-response protection, max five results, keyboard/pointer selection, GeoNames attribution, loading/empty/error states, and uninterrupted manual entry.
- [x] Implement `ProfileLocationFields` to coordinate country changes and catalogue/manual selection state.
- [x] Integrate the shared component into incomplete and completed Profile editors without changing the page skeleton, Business banner, verification cards, or other four Profile steps.
- [x] Add English, Simplified Chinese, and Bahasa Melayu copy.
- [x] Verify component, Profile contract, and i18n tests.

## Phase 4 — Verification and handoff

- [x] Run affected Vitest and Node tests: 157 Vitest tests and 4 Node tests passed.
- [x] Run `npm run lint`: 0 errors; 55 pre-existing repository warnings.
- [x] Run `npx tsc --noEmit`: passed.
- [x] Record the local Supabase limitation: Docker/Podman is unavailable, so no migration was applied locally or to the linked remote database.
- [x] Run one bounded `luna_worker` permission/privacy review; repair all four confirmed must-fix findings.
- [ ] Perform browser QA on incomplete/completed Profile, three locales, light/dark, and narrow/desktop layouts; distinguish unimported local data from code failure.
- [x] Record browser/design QA evidence and the migration blocker in `design-qa.md`.

## Risks

- **Catalogue not imported:** suggestions are empty but manual entry remains fully functional; deployment runbook must execute importer.
- **Index size:** `cities1000` alternate names can enlarge trigram indexes; keep only required columns and bounded results, then measure before considering alias normalization.
- **Legacy rows:** nullable metadata keeps existing city/country strings valid.
- **Country mismatch:** server resolves catalogue row and rejects mismatched ISO code.
- **Privacy:** application never logs city queries or couples them to Profile identity.
- **License:** suggestion dropdown includes GeoNames attribution; source/license stay documented.
- **Import portability:** importer requires `unzip`; it fails clearly before writing when unavailable.
