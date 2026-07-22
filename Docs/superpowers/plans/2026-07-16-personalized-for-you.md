# Personalised For You Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend the mandatory preference survey with preferred distance and deliver tier-aware basic/personalised recommendations on a dedicated customer For You page.

**Architecture:** Preferences remain a required Profile Complete step. A pure scorer ranks existing catalogue activities deterministically; Gemini receives only de-identified preference and public candidate metadata to produce a short explanation, with a deterministic fallback. The same page returns generic recommendations to Phone Verified users and personalised results to Profile Complete users.

**Tech Stack:** Next.js App Router, TypeScript, Supabase RPC/queries, Google Maps geocoding, Gemini REST API, Vitest.

## Global Constraints

- Survey remains required for `profile_complete`; do not weaken that existing tier rule.
- Preferred distance values are exactly `walking | nearby | travel | anywhere | no_preference`.
- Browser location is optional and never stored; Profile city is the fallback origin.
- Do not change existing Explore or Map ranking behavior.
- Gemini receives no name, email, phone, IC, bio, exact device coordinates, or KYC data.

---

### Task 1: Persist and edit preferred distance

**Files:**
- Create: `supabase/migrations/060_preferred_distance.sql`
- Modify: `lib/validation/profile-schemas.ts`
- Modify: `app/api/profile/survey/route.ts`
- Modify: `lib/profile/profile-summary.ts`
- Modify: `backend/core/types.ts`
- Test: `lib/validation/__tests__/profile-schemas.test.ts`, `lib/profile/__tests__/profile-summary.test.ts`

- [ ] **Step 1: Write failing schema tests**

```ts
it('accepts each supported preferred distance', () => {
  expect(preferenceSurveySchema.parse(validSurvey({ preferredDistance: 'nearby' })).preferredDistance).toBe('nearby');
});
it('rejects an arbitrary distance value', () => {
  expect(() => preferenceSurveySchema.parse(validSurvey({ preferredDistance: '3km' }))).toThrow();
});
```

- [ ] **Step 2: Run tests and verify failure**

Run: `npm test -- --run lib/validation/__tests__/profile-schemas.test.ts lib/profile/__tests__/profile-summary.test.ts`

Expected: FAIL because `preferredDistance` is absent.

- [ ] **Step 3: Add migration and API contract**

```sql
alter table public.preference_survey_responses
  add column preferred_distance text not null default 'no_preference'
  check (preferred_distance in ('walking','nearby','travel','anywhere','no_preference'));
```

Extend `complete_preference_survey` with `p_preferred_distance text`, update POST/PUT/GET selections, `PreferenceRow`, `ProfileSummary.survey`, and the Zod schema.

- [ ] **Step 4: Run tests, type check, and disposable DB reset**

Run: `npm test -- --run lib/validation/__tests__/profile-schemas.test.ts lib/profile/__tests__/profile-summary.test.ts && npx tsc --noEmit && supabase db reset`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/060_preferred_distance.sql lib/validation/profile-schemas.ts app/api/profile/survey/route.ts lib/profile/profile-summary.ts backend/core/types.ts lib/validation/__tests__/profile-schemas.test.ts lib/profile/__tests__/profile-summary.test.ts
git commit -m "feat: add preferred distance to travel survey"
```

### Task 2: Add distance choices to the wizard and Profile settings

**Files:**
- Modify: `app/customer/profile/page.tsx`
- Modify: `components/profile/profile-sections.tsx`
- Test: `app/customer/profile/__tests__/preferred-distance.test.tsx`

- [ ] **Step 1: Write a failing UI test**

```tsx
it('submits nearby as the selected preferred distance from the wizard', async () => {
  render(<ProfileCompletionPage />);
  await user.click(screen.getByRole('button', { name: 'Nearby (≤ 5 km)' }));
  await user.click(screen.getByRole('button', { name: 'Complete Profile' }));
  expect(fetch).toHaveBeenLastCalledWith('/api/profile/survey', expect.objectContaining({ body: expect.stringContaining('"preferredDistance":"nearby"') }));
});
```

- [ ] **Step 2: Run test and verify it fails**

Run: `npm test -- --run app/customer/profile/__tests__/preferred-distance.test.tsx`

Expected: FAIL because the choice is not rendered or submitted.

- [ ] **Step 3: Implement the shared options**

Define one exported constant used by both screens:

```ts
export const PREFERRED_DISTANCE_OPTIONS = [
  ['walking', 'Walking distance (≤ 1 km)'],
  ['nearby', 'Nearby (≤ 5 km)'],
  ['travel', 'Willing to travel (≤ 20 km)'],
  ['anywhere', 'Anywhere in Malaysia'],
  ['no_preference', 'No preference'],
] as const;
```

Add it to the wizard survey step and the existing Preferences settings section; load/save it through `/api/profile/survey`.

- [ ] **Step 4: Verify**

Run: `npm test -- --run app/customer/profile/__tests__/preferred-distance.test.tsx && npx eslint app/customer/profile/page.tsx components/profile/profile-sections.tsx`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/customer/profile/page.tsx components/profile/profile-sections.tsx app/customer/profile/__tests__/preferred-distance.test.tsx
git commit -m "feat: collect preferred travel distance"
```

### Task 3: Build deterministic personalisation and safe Gemini explanations

**Files:**
- Create: `lib/personalization/scorer.ts`
- Create: `lib/personalization/explanation.ts`
- Create: `lib/personalization/__tests__/scorer.test.ts`
- Create: `lib/personalization/__tests__/explanation.test.ts`

**Interfaces:**
- `rankActivities(input): RankedActivity[]` accepts only preference values, optional origin, and public `ComputedActivity` data.
- `describeFit(input): Promise<string>` returns a Gemini explanation or deterministic fallback.

- [ ] **Step 1: Write failing scorer and fallback tests**

```ts
it('ranks a food tag above unrelated activities for a food preference', () => {
  expect(rankActivities({ preferences: prefs({ interests: ['food'] }), activities }).at(0)?.activity.id).toBe('food-activity');
});
it('falls back without contacting Gemini when the service is unavailable', async () => {
  mockGeminiFailure(429);
  await expect(describeFit(publicInput)).resolves.toContain('matches your');
});
```

- [ ] **Step 2: Run tests and verify failure**

Run: `npm test -- --run lib/personalization/__tests__/scorer.test.ts lib/personalization/__tests__/explanation.test.ts`

Expected: FAIL because modules are absent.

- [ ] **Step 3: Implement deterministic policy**

Use exact scores: +40 for a matching category/tag interest, +25 for the matching price band (`budget <= RM100`, `mid_range RM101–300`, `luxury > RM300`), +20 when the optional origin is within the selected 1/5/20 km limit, and +10 for matching mobility tags. Outside the selected finite distance must be excluded; `anywhere` and `no_preference` do not exclude by distance. Preserve stable catalogue order as the final tie-breaker.

`describeFit` must send only preference labels and public activity metadata to `GEMINI_MODEL` / `GOOGLE_AI_KEY`, request one sentence, enforce a 220-character maximum, and use `buildFallbackFitCopy` on every failure.

- [ ] **Step 4: Verify**

Run: `npm test -- --run lib/personalization/__tests__/scorer.test.ts lib/personalization/__tests__/explanation.test.ts && npx tsc --noEmit`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/personalization
git commit -m "feat: rank activities from customer travel preferences"
```

### Task 4: Serve and render the tier-aware For You page

**Files:**
- Create: `app/api/personalized-recommendations/route.ts`
- Create: `app/customer/for-you/page.tsx`
- Modify: `app/customer/layout.tsx`
- Modify: `components/profile/profile-sections.tsx` (add `id="preferences"` to the section)
- Test: `app/api/personalized-recommendations/__tests__/route.test.ts`, `app/customer/for-you/__tests__/page.test.tsx`

- [ ] **Step 1: Write route tests**

```ts
it('rejects Email-only users and allows Phone Verified generic results', async () => {
  mockTier('email_verified'); expect((await GET(request())).status).toBe(403);
  mockTier('phone_verified'); expect((await GET(request())).status).toBe(200);
});
it('returns explanation only for Profile Complete users with a completed survey', async () => {
  mockTier('profile_complete');
  expect(await responseData(GET(request()))).toMatchObject({ mode: 'personalized' });
});
```

- [ ] **Step 2: Run tests and verify failure**

Run: `npm test -- --run app/api/personalized-recommendations/__tests__/route.test.ts app/customer/for-you/__tests__/page.test.tsx`

Expected: FAIL because endpoint and page are absent.

- [ ] **Step 3: Implement API and UI states**

The API accepts optional `{ latitude, longitude }` validated to real coordinate bounds. It reads the authenticated user tier and survey, calls existing `searchActivities`, then returns:

```ts
{ mode: 'generic' | 'personalized', activities: Array<{ activity: ComputedActivity; score?: number; whyItFits?: string }>, locationSource: 'browser' | 'city' | 'none' }
```

For `phone_verified`, return generic recommended activities and a Profile completion CTA. For `profile_complete`/`kyc_verified`, rank and explain activities. The client asks for `navigator.geolocation` only after an explicit “Use my location” action; on denial, it calls the API without coordinates, which uses the profile city geocode if available and otherwise omits distance filtering.

Update header navigation: add `For You` before `Explore`; add a right-side `Preferences` link immediately before `My Account` pointing to `/customer/profile#preferences`. Do not add explanatory Preferences text or a card.

- [ ] **Step 4: Verify visual and automated behavior**

Run: `npm test -- --run app/api/personalized-recommendations/__tests__/route.test.ts app/customer/for-you/__tests__/page.test.tsx && npx tsc --noEmit`

Manual: Phone Verified sees generic cards; Profile Complete sees preference chips and `Why it fits you`; Preferences opens the Profile preferences section; no browser location is persisted.

- [ ] **Step 5: Commit**

```bash
git add app/api/personalized-recommendations app/customer/for-you app/customer/layout.tsx components/profile/profile-sections.tsx
git commit -m "feat: add tier-aware personalized recommendations"
```
