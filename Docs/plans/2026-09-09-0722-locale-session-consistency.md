# Locale and Login Session Consistency Implementation Plan

> **For agentic workers:** Execute this plan in order with test-driven development and stop if a required verification exposes an out-of-scope defect.

**Status:** Approved for implementation on 2026-09-09.

**Goal:** Keep the language selector synchronized with the language actually rendered on screen, and prevent a failed login attempt from retaining a previously authenticated administrator session.

**Architecture:** The i18n provider remains the sole source of truth for the displayed locale. The selector saves the preference, refreshes the current route, and changes only when `i18n.resolvedLanguage` changes. Authentication failures perform a best-effort local Supabase sign-out before presenting the existing generic error, so a failed identity switch cannot fall back to a stale local session.

**Tech Stack:** Next.js 16 App Router, React, TypeScript, react-i18next, Supabase Auth, Vitest.

## Global Constraints

- Preserve the current route when changing language; do not add redirects or route pushes.
- Preserve existing successful email, Google, guest, and demo-account flows.
- Do not reveal authentication provider details or whether an account exists.
- Reuse the current Supabase client and existing translated feedback.
- Do not alter locale catalog files, role routing, authorization rules, database schema, migrations, or seed data.
- No new dependencies.

### Task 1: Make the language selector reflect rendered language only

**Files:**

- Modify: `components/shared/__tests__/language-switcher.test.tsx`
- Modify: `components/shared/language-switcher.tsx`

**Functions/components affected:** `LanguageSwitcher`, its `useTranslation` test mock, and locale-change interaction tests. `saveLocalePreference` remains unchanged.

1. Add a failing test that renders the selector in English, changes the mocked `i18n.resolvedLanguage` to Simplified Chinese, rerenders the same component, and expects the selected value to follow the provider.
2. Update the success test to assert that the visible selection remains on the currently rendered locale while the refresh is pending, then follows the provider after rerender.
3. Run the focused language-switcher test and confirm the new synchronization assertion fails against the current local-state implementation.
4. Remove the independent `confirmedLocale` state. Compare requested changes with `resolvedLocale`, bind the `<select>` value to `resolvedLocale`, and leave saving/error/refresh behavior intact.
5. Run the focused test again and confirm it passes.

### Task 2: Clear stale local identity after failed login attempts

**Files:**

- Modify: `app/login/__tests__/signin-feedback.test.ts`
- Modify: `app/login/page.tsx`
- Modify: `components/providers/__tests__/auth-state-errors.test.ts`
- Modify: `components/providers/auth.tsx`

**Functions/components affected:** `LoginContent.signIn` and `AuthProvider.switchUser`.

1. Add failing source-contract tests requiring a local-scope Supabase sign-out in both the email/password failure branch and the demo-switch failure branch.
2. Run both focused tests and confirm they fail against the current behavior.
3. In `signIn`, when `signInWithPassword` returns an error, perform a best-effort `supabase.auth.signOut({ scope: "local" })`, ignore cleanup failure, and then show the existing translated sign-in error.
4. In `switchUser`, when `/api/auth/demo-signin` fails, perform the same best-effort local sign-out before throwing the existing generic error. Add `supabase` to the callback dependencies.
5. Run both focused tests again and confirm they pass.

### Task 3: Verify the connected flow and guard scope

**Files:**

- Modify only if test evidence identifies a confirmed requirement violation in one of the four implementation files above.
- Record verification evidence in this plan after execution.

1. Run the affected Vitest files for language switching, locale API/provider behavior, login feedback, auth-state errors, and post-login destination behavior.
2. In the browser, switch Customer Alice among English, Simplified Chinese, and Bahasa Melayu. For each switch, verify the dropdown value and rendered copy agree and the URL stays under the customer route.
3. Verify a failed sign-in no longer leaves the previous local identity available to role-based navigation.
4. Request one bounded read-only security/session review from `luna_worker`; classify confirmed findings as must-fix or follow-up.
5. Run `npx tsc --noEmit`, `npm run lint`, and `git diff --check` once after the final code change.

## Scope Boundaries

**In scope:** selector/provider consistency, stale local-session cleanup on failed email and demo login, focused regression coverage, and verification.

**Not touched:** translation catalogs, `/api/locale`, Supabase proxy locale precedence, OAuth implementation, post-login role destinations, access-control UI, database objects, migrations, sponsored carousel work, or unrelated dirty files.

## Risks

- Supabase sign-out itself may fail; cleanup is deliberately best-effort so the original authentication error remains understandable.
- The selector will intentionally keep showing the currently rendered language during the save/refresh interval, preventing mixed-language UI rather than optimistically changing one control.
- Browser verification can mutate the demo account's saved locale; restore Customer Alice to English after the check.

## Verification Evidence

- Pending implementation.
