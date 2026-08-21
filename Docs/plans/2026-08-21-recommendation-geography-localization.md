# Recommendation Geography and Localization Implementation Plan

> **For agentic workers:** Use test-driven development. Each behavioural change starts with a failing focused test, followed by the smallest production change that makes it pass.

**Goal:** Let a Super Admin safely confirm a recommended business's internal Area/POI candidate and generate, edit, approve, or reject Chinese and Malay drafts for the recommendation's public business name and description.

**Architecture:** Google Maps remains the external source for submitted address and coordinates. A server-side, deterministic nearest-Place helper creates only a non-authoritative candidate; the Super Admin resolves it. A reusable `content_translations` table stores source-hash-bound drafts, and privileged server routes use the existing AI provider with only business name/description strings.

**Tech Stack:** Next.js App Router, TypeScript, Supabase/Postgres RLS, Vitest, existing `lib/ai/provider.ts`, i18next.

## Scope and Boundaries

- Modify only recommendation administration, migration/test coverage, and the three admin locale files.
- Do not alter customer recommendation submission, Google Maps Picker fields, existing `places` rows, vendor onboarding conversion, customer-facing Vendor/Outlet/Product rendering, or Stripe/payment code.
- Do not add dependencies or call Google from the server.
- Database change: additive migration `20260821150000_recommendation_geography_localization.sql` creates `content_translations` and adds nullable recommendation resolution columns.
- Risk: a nearest coordinate is not proof of business membership in a POI. It is always shown as a suggestion and never becomes `resolved_place_id` without Super Admin action.

### Task 1: Persist and resolve geographic candidates

**Files:**
- Create: `supabase/migrations/20260821150000_recommendation_geography_localization.sql`
- Create: `supabase/migrations/__tests__/20260821150000_recommendation_geography_localization.test.ts`
- Create: `lib/recommendations/place-resolution.ts`
- Create: `lib/recommendations/__tests__/place-resolution.test.ts`

**Interfaces:**
- Produces `selectSuggestedPlace(latitude, longitude, places): SuggestedPlace | null`.
- Produces `content_translations` with source-hash uniqueness and admin-only draft access.
- Adds `suggested_place_id`, `resolved_place_id`, and `place_resolution_status` to `vendor_recommendations`.

- [ ] Write tests proving that a candidate must be within the fixed 5 km threshold, that an out-of-range recommendation is unresolved, and that the migration keeps Google `place_id` separate from internal `places.id`.
- [ ] Run `npx vitest run lib/recommendations/__tests__/place-resolution.test.ts supabase/migrations/__tests__/20260821150000_recommendation_geography_localization.test.ts` and confirm they fail because the helper and migration do not exist.
- [ ] Add the pure Haversine helper, additive foreign keys/check constraint/indexes, RLS, and a unique `(entity_type, entity_id, field, locale, source_hash)` constraint. Do not create any public draft-read policy.
- [ ] Re-run the focused tests and confirm they pass.

### Task 2: Add privileged review and translation APIs

**Files:**
- Create: `lib/recommendations/content-localization.ts`
- Create: `lib/recommendations/__tests__/content-localization.test.ts`
- Create: `app/api/admin/recommendations/[id]/localization/route.ts`
- Create: `app/api/admin/recommendations/[id]/localization/__tests__/route.test.ts`
- Modify: `app/api/admin/recommendations/[id]/route.ts`
- Modify: `lib/recommendations/admin-detail.ts`
- Modify: `app/api/admin/recommendations/__tests__/detail.route.test.ts`

**Interfaces:**
- `sourceHash(sourceText: string): string` binds every draft to the exact submitted source.
- `buildTranslationPrompt({ field, sourceText, locale }): { system, user }` returns only business text and target locale instructions.
- `POST /api/admin/recommendations/:id/localization` accepts `{ action: 'suggest_place' | 'confirm_place' | 'clear_place' | 'generate' }` and uses only `is_super_admin` authorization.
- `PATCH /api/admin/recommendations/:id/localization` accepts `{ translationId, translatedText, status: 'approved' | 'rejected' }`.

- [ ] Write route tests for unauthenticated (401), non-super-admin (403), `confirm_place` with an internal UUID only, generation rejected before recommendation approval (409), and a prompt that excludes phone/email/website/images/Google IDs.
- [ ] Run the route and helper tests; confirm they fail because the localization route and source-hash helper do not exist.
- [ ] Implement the shared hash/prompt helpers, the Super Admin-only route, idempotent upsert of name/description drafts for `zh-CN` and `ms`, and edit/approval state transitions. Return provider-unavailable as a retryable error without changing recommendation approval.
- [ ] Extend the existing admin detail DTO/query to return non-sensitive `suggestedPlace`, `resolvedPlace`, and translation drafts only after the existing admin authorization check.
- [ ] Re-run all Task 2 focused tests and confirm they pass.

### Task 3: Expose the supervised workflow in the recommendation detail screen

**Files:**
- Modify: `components/admin/recommendation-detail-view.tsx`
- Modify: `app/i18n/locales/en/admin.json`
- Modify: `app/i18n/locales/zh-CN/admin.json`
- Modify: `app/i18n/locales/ms/admin.json`
- Modify: `app/admin/recommendations/__tests__/detail-page.test.ts`
- Modify: `app/admin/__tests__/sitewide-i18n.contract.test.ts` only if the existing contract requires new namespace coverage.

**Interfaces:**
- Consumes `AdminRecommendationDetail.localization` from Task 2.
- Calls the localization route only from the Super Admin recommendation detail page.

- [ ] Write a screen contract test for the Area suggestion/confirm/clear controls, “Generate Chinese & Malay drafts” control, and draft edit/approve/reject controls.
- [ ] Run the screen contract test and confirm it fails because those controls do not exist.
- [ ] Add a compact admin-only localization panel below the existing Google evidence: show the suggested Area, confirmed Area (if any), confirm/clear actions, and translation drafts with original text. Keep drafts off customer pages.
- [ ] Add matching English, Chinese, and Malay locale keys without raw user-facing strings in the component.
- [ ] Re-run the focused UI/i18n tests and confirm they pass.

### Task 4: Final verification and handoff

**Files:**
- Modify only files from Tasks 1–3 if a failing focused verification exposes a confirmed core-flow or authorization defect.

- [ ] Run `git diff --check`.
- [ ] Run `npm run lint` and `npx tsc --noEmit`.
- [ ] Run the focused recommendation/localization tests, then `npm run verify:i18n`.
- [ ] Run one focused fresh security review of admin authorization, RLS, Google/internal identifier separation, and AI prompt fields.
- [ ] Commit implementation only after the above commands pass or any environment limitation is recorded.

## Spec Coverage Review

- Google location becomes only a suggested internal Place: Task 1 and Task 2.
- Super Admin confirms, changes, or clears the relation: Task 2 and Task 3.
- Source text is preserved and AI sees no private evidence: Task 2.
- Chinese/Malay drafts are idempotent, reviewed, and non-public: Task 1 and Task 2.
- Static state localization and broader public resolver remain outside this first delivery: existing state i18n stays unchanged; later Vendor/Outlet/Product/Place public rendering is intentionally not included.

## Verification

- Migration contracts verify additive schema, RLS, no Google-to-Place conflation, and draft uniqueness.
- Unit tests cover Haversine candidate confidence and source hash/prompt allow-listing.
- API tests cover Super Admin authorization, status gates, idempotency, and no-private-data prompts.
- UI and i18n contracts cover the admin review controls and locale parity.
