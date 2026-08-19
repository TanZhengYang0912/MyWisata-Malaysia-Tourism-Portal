# Sitewide Cookie-Based Internationalization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add English, Simplified Chinese, and Bahasa Melayu UI support to every MyWisata web role while preserving the current URLs and storing one durable language preference per account.

**Architecture:** `next-i18next` runs in no-locale-path mode. The existing Supabase proxy refreshes authentication, resolves locale using account → cookie → browser → English precedence, and forwards one locale header to the async root layout. A shared locale API updates the cookie for everyone and `users.preferred_locale` for authenticated users; shared translation resources and one `LanguageSwitcher` serve all role shells.

**Tech Stack:** Next.js 16 App Router, TypeScript, React 19, `next-i18next` v16, `i18next`, `react-i18next`, Supabase/PostgreSQL, Vitest, Playwright.

## Global Constraints

- Supported locales are exactly `en`, `zh-CN`, and `ms`; fallback is `en`.
- Keep `/customer`, `/guest`, `/vendor`, `/admin`, `/login`, callback, and API URLs unchanged.
- Translate system-owned UI copy only; never machine-translate user/vendor content.
- Currency remains MYR/RM; only locale formatting changes.
- The existing Supabase auth refresh in `proxy.ts` must remain functional.
- Language names must appear natively as `English`, `简体中文`, and `Bahasa Melayu`.
- Missing keys fall back to English and fail the translation-parity test.
- Do not refactor permissions, role routing, payment, wallet, moderation, or recommendation business logic.
- Work in the existing dirty worktree without reverting unrelated changes; stage only files owned by the current task.
- Before each commit, inspect `git diff --cached`; use `git add -p -- <task paths>` for modified files that already contained user changes, and reject every pre-existing hunk not produced by the task.
- Every implementation task follows red → green TDD and ends in one focused commit.

---

## File Structure and Ownership

### New foundation files

- `i18n.config.ts`: `next-i18next` no-path configuration and namespace list.
- `lib/i18n/locale.ts`: locale types, guards, Accept-Language matching, and precedence.
- `lib/i18n/resources.ts`: typed locale/namespace resource loaders.
- `lib/i18n/server.ts`: request-locale and server translation helpers.
- `components/providers/i18n-provider.tsx`: client provider wrapper.
- `components/shared/language-switcher.tsx`: one accessible language selector.
- `app/api/locale/route.ts`: validated cookie/account update endpoint.
- `app/i18n/locales/{en,zh-CN,ms}/{common,auth,customer,vendor,admin}.json`: dictionaries.
- `supabase/migrations/20260817234400_user_preferred_locale.sql`: account setting and constraint.

### Existing integration files

- `proxy.ts`, `lib/supabase/proxy.ts`: preserve auth refresh and forward resolved locale.
- `app/layout.tsx`: async locale/resource resolution, `<html lang>`, provider.
- `backend/core/types.ts`, `components/providers/auth.tsx`: expose `preferredLocale` on the authenticated user.
- `app/login/page.tsx`, `app/customer/layout.tsx`, `app/guest/layout.tsx`, `components/layout/vendor-sidebar.tsx`, `app/admin/layout.tsx`: global switcher access.
- Role pages/components listed in Tasks 6–9: replace fixed UI strings with translation keys without changing business behavior.

### Files not touched

- User/vendor-submitted database content and recommendation evidence.
- Email templates, PDFs, CSV contents, Supabase functions unrelated to locale, payment provider code, wallet calculations, and third-party hosted pages.
- Route folder names and authorization rules.

---

### Task 1: Locale contracts, configuration, and resource parity

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Create: `i18n.config.ts`
- Create: `lib/i18n/locale.ts`
- Create: `lib/i18n/resources.ts`
- Create: `lib/i18n/__tests__/locale.test.ts`
- Create: `lib/i18n/__tests__/resources.test.ts`
- Create: `app/i18n/locales/en/common.json`
- Create: `app/i18n/locales/zh-CN/common.json`
- Create: `app/i18n/locales/ms/common.json`
- Create: `app/i18n/locales/en/auth.json`, `app/i18n/locales/en/customer.json`, `app/i18n/locales/en/vendor.json`, `app/i18n/locales/en/admin.json`
- Create: `app/i18n/locales/zh-CN/auth.json`, `app/i18n/locales/zh-CN/customer.json`, `app/i18n/locales/zh-CN/vendor.json`, `app/i18n/locales/zh-CN/admin.json`
- Create: `app/i18n/locales/ms/auth.json`, `app/i18n/locales/ms/customer.json`, `app/i18n/locales/ms/vendor.json`, `app/i18n/locales/ms/admin.json`

**Interfaces:**
- Produces: `APP_LOCALES`, `AppLocale`, `DEFAULT_LOCALE`, `LOCALE_COOKIE`, `isAppLocale(value)`, `matchAcceptedLocale(header)`, and `resolveAppLocale(input)`.
- Produces: `APP_NAMESPACES`, `AppNamespace`, and `loadLocaleResources(locale)`.
- Consumed by: proxy, root layout, locale API, provider, switcher, and all translation migrations.

- [ ] **Step 1: Install the approved runtime**

Run:

```bash
npm install next-i18next@^16 i18next react-i18next
```

Expected: `package.json` and the repository lockfile contain the three dependencies; no unrelated dependency is upgraded.

- [ ] **Step 2: Write failing locale precedence tests**

Create `lib/i18n/__tests__/locale.test.ts` with exactly these cases:

```ts
import { describe, expect, it } from "vitest";
import { isAppLocale, matchAcceptedLocale, resolveAppLocale } from "../locale";

describe("resolveAppLocale", () => {
  it("uses account, cookie, browser, then English precedence", () => {
    expect(resolveAppLocale({ accountLocale: "ms", cookieLocale: "zh-CN", acceptLanguage: "en" })).toBe("ms");
    expect(resolveAppLocale({ accountLocale: null, cookieLocale: "zh-CN", acceptLanguage: "ms-MY,en;q=0.8" })).toBe("zh-CN");
    expect(resolveAppLocale({ accountLocale: null, cookieLocale: null, acceptLanguage: "ms-MY,en;q=0.8" })).toBe("ms");
    expect(resolveAppLocale({ accountLocale: null, cookieLocale: "xx", acceptLanguage: "fr" })).toBe("en");
  });

  it("normalizes supported browser variants without accepting arbitrary values", () => {
    expect(matchAcceptedLocale("zh-SG,zh;q=0.9,en;q=0.8")).toBe("zh-CN");
    expect(matchAcceptedLocale("ms-MY,en;q=0.8")).toBe("ms");
    expect(isAppLocale("en")).toBe(true);
    expect(isAppLocale("zh-TW")).toBe(false);
  });
});
```

- [ ] **Step 3: Run the test and confirm red**

Run:

```bash
npx vitest run lib/i18n/__tests__/locale.test.ts
```

Expected: FAIL because `lib/i18n/locale.ts` does not exist.

- [ ] **Step 4: Implement the locale contract**

Create `lib/i18n/locale.ts` with this public contract:

```ts
export const APP_LOCALES = ["en", "zh-CN", "ms"] as const;
export type AppLocale = (typeof APP_LOCALES)[number];
export const DEFAULT_LOCALE: AppLocale = "en";
export const LOCALE_COOKIE = "NEXT_LOCALE";

export type ResolveLocaleInput = {
  accountLocale?: string | null;
  cookieLocale?: string | null;
  acceptLanguage?: string | null;
};

export function isAppLocale(value: unknown): value is AppLocale;
export function matchAcceptedLocale(header: string | null | undefined): AppLocale | null;
export function resolveAppLocale(input: ResolveLocaleInput): AppLocale;
```

Use weighted `Accept-Language` entries, map `zh`, `zh-CN`, `zh-SG`, and other Simplified-Chinese-compatible `zh-*` values to `zh-CN`, map `ms`/`ms-MY` to `ms`, and default unsupported languages to `en` only after all sources are exhausted.

- [ ] **Step 5: Add configuration and initial resource loaders**

Create `i18n.config.ts` with `supportedLngs: APP_LOCALES`, `fallbackLng: "en"`, `localeInPath: false`, namespaces `common`, `auth`, `customer`, `vendor`, and `admin`, and a bundler-traceable dynamic resource loader for `app/i18n/locales`.

Create `lib/i18n/resources.ts` with:

```ts
export const APP_NAMESPACES = ["common", "auth", "customer", "vendor", "admin"] as const;
export type AppNamespace = (typeof APP_NAMESPACES)[number];
export type AppResources = Record<AppNamespace, Record<string, unknown>>;
export async function loadLocaleResources(locale: AppLocale): Promise<AppResources>;
```

Seed `common.json` with real shared keys used in Task 4: language names, save/cancel/close/confirm, loading, search, clear, previous/next, page counts, sign out, statuses, and generic errors. The other namespaces initially contain `{}` in every locale.

- [ ] **Step 6: Write and run translation parity tests**

Create `lib/i18n/__tests__/resources.test.ts` that recursively flattens every JSON object and asserts each non-English namespace has exactly the English key set and no empty string values.

Run:

```bash
npx vitest run lib/i18n/__tests__/locale.test.ts lib/i18n/__tests__/resources.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit Task 1**

```bash
git add i18n.config.ts lib/i18n app/i18n/locales
git add -p -- package.json package-lock.json
git diff --cached --check
git commit -m "feat: add sitewide locale contracts"
```

---

### Task 2: Persist the account locale and expose one update API

**Files:**
- Create: `supabase/migrations/20260817234400_user_preferred_locale.sql`
- Create: `supabase/migrations/__tests__/20260817234400_user_preferred_locale.test.ts`
- Create: `app/api/locale/route.ts`
- Create: `app/api/locale/__tests__/route.test.ts`
- Modify: `backend/core/types.ts`
- Modify: `components/providers/auth.tsx`

**Interfaces:**
- Consumes: `AppLocale`, `isAppLocale`, `LOCALE_COOKIE` from Task 1.
- Produces: `User.preferredLocale?: AppLocale`.
- Produces: `POST /api/locale` accepting `{ locale: AppLocale }` and returning `{ data: { locale: AppLocale, persistedToAccount: boolean } }`.

- [ ] **Step 1: Write the failing migration contract test**

The test must read the migration source and assert it adds `public.users.preferred_locale`, allows only `en`, `zh-CN`, `ms`, defaults to null, and does not add the field to any public profile view.

Run:

```bash
npx vitest run supabase/migrations/__tests__/20260817234400_user_preferred_locale.test.ts
```

Expected: FAIL because the migration is missing.

- [ ] **Step 2: Add the database migration**

Create this SQL:

```sql
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS preferred_locale TEXT;

ALTER TABLE public.users
  DROP CONSTRAINT IF EXISTS users_preferred_locale_check;

ALTER TABLE public.users
  ADD CONSTRAINT users_preferred_locale_check
  CHECK (preferred_locale IS NULL OR preferred_locale IN ('en', 'zh-CN', 'ms'));
```

Do not change existing public-profile views or grants.

- [ ] **Step 3: Write failing locale API tests**

Mock `cookies()` and the server Supabase client. Cover:

```ts
it("writes only the cookie for an anonymous visitor");
it("updates only the authenticated user's preferred_locale before writing the cookie");
it("rejects zh-TW and arbitrary locale values with 400");
it("does not change the cookie when the authenticated database update fails");
```

Assert cookie options include `path: "/"`, `sameSite: "lax"`, and a one-year `maxAge`; use `secure: process.env.NODE_ENV === "production"`.

- [ ] **Step 4: Run the API tests and confirm red**

```bash
npx vitest run app/api/locale/__tests__/route.test.ts
```

Expected: FAIL because the route does not exist.

- [ ] **Step 5: Implement the shared locale API**

Implement `POST` with this behavior:

```ts
type LocaleRequest = { locale?: unknown };
type LocaleResponse = { data: { locale: AppLocale; persistedToAccount: boolean } };
```

Parse JSON, reject unsupported values, call `supabase.auth.getUser()`, update `.from("users").update({ preferred_locale: locale }).eq("id", user.id)` only when authenticated, stop on database error, then write `NEXT_LOCALE` and return 200. Anonymous requests skip the database update but still set the cookie.

- [ ] **Step 6: Add locale to the authenticated profile type**

Add `preferredLocale?: AppLocale` to `User`. Extend `loadSupabaseUser`'s select with `preferred_locale` and map it only through `isAppLocale`; invalid legacy data becomes `undefined`.

- [ ] **Step 7: Run focused verification**

```bash
npx vitest run app/api/locale/__tests__/route.test.ts supabase/migrations/__tests__/20260817234400_user_preferred_locale.test.ts components/providers/__tests__/auth-demo-session.test.ts
npx tsc --noEmit
```

Expected: PASS.

- [ ] **Step 8: Commit Task 2**

```bash
git add supabase/migrations/20260817234400_user_preferred_locale.sql supabase/migrations/__tests__/20260817234400_user_preferred_locale.test.ts app/api/locale
git add -p -- backend/core/types.ts components/providers/auth.tsx
git diff --cached --check
git commit -m "feat: persist user locale preference"
```

---

### Task 3: Resolve locale during Supabase proxy refresh and hydrate the root layout

**Files:**
- Modify: `lib/supabase/proxy.ts`
- Modify: `proxy.ts`
- Modify: `app/layout.tsx`
- Create: `lib/i18n/server.ts`
- Create: `components/providers/i18n-provider.tsx`
- Create: `lib/supabase/__tests__/proxy-locale.test.ts`
- Create: `app/__tests__/i18n-layout.contract.test.ts`

**Interfaces:**
- Consumes: locale contracts/resources from Task 1 and `users.preferred_locale` from Task 2.
- Produces: request header `x-app-locale: AppLocale` and synchronized `NEXT_LOCALE` cookie.
- Produces: `getRequestLocale(): Promise<AppLocale>`, `getServerTranslation(namespace: AppNamespace): Promise<{ locale: AppLocale; t: TFunction }>`, and `AppI18nProvider({ locale, resources, children })`.

- [ ] **Step 1: Write failing proxy tests**

Mock `createServerClient` and cover authenticated account precedence, anonymous cookie precedence, browser fallback, invalid cookie replacement, and preservation of Supabase `Set-Cookie` values when locale is added. Assert only `preferred_locale` is selected and the query is scoped to the authenticated claim `sub`.

- [ ] **Step 2: Write the failing root-layout contract test**

Assert `app/layout.tsx` is async, gets the request locale server-side, sets `<html lang={locale}>`, and wraps existing `ActionFeedbackProvider`, `AuthProvider`, and `CartProvider` inside `AppI18nProvider` without reordering the existing auth/cart relationship.

- [ ] **Step 3: Run the tests and confirm red**

```bash
npx vitest run lib/supabase/__tests__/proxy-locale.test.ts app/__tests__/i18n-layout.contract.test.ts
```

Expected: FAIL because locale-aware proxy/layout helpers do not exist.

- [ ] **Step 4: Refactor the proxy response construction without changing auth semantics**

Keep `updateSession(request: NextRequest): Promise<NextResponse>` as the public function. Internally:

```ts
const forwardedHeaders = new Headers(request.headers);
const pendingCookies: Array<{ name: string; value: string; options?: Record<string, unknown> }> = [];
```

Let Supabase's `setAll` update the request cookies and collect response cookies. Call `getClaims()` exactly as today, read `claims.sub`, select only `preferred_locale` for that user, resolve locale, set `x-app-locale`, build one final `NextResponse.next({ request: { headers: forwardedHeaders } })`, and apply all pending auth cookies plus the locale cookie. Never drop Supabase response headers supplied to `setAll`.

- [ ] **Step 5: Implement server locale access and the provider**

`getRequestLocale()` reads `x-app-locale` from `headers()`, validates it, and returns English on absence/invalidity. `getServerTranslation(namespace)` loads the same request locale/resources and returns the initialized server `t` function. `AppI18nProvider` initializes the approved client runtime once with the server-selected locale/resources and updates only when its `locale` prop changes.

- [ ] **Step 6: Make the root layout locale-aware**

Convert `RootLayout` to async, resolve locale/resources before JSX, use `<html lang={locale}>`, and keep the existing fonts and provider order intact.

- [ ] **Step 7: Run focused verification**

```bash
npx vitest run lib/i18n/__tests__ lib/supabase/__tests__/proxy-locale.test.ts app/__tests__/i18n-layout.contract.test.ts
npx tsc --noEmit
```

Expected: PASS with no auth-cookie regression.

- [ ] **Step 8: Commit Task 3**

```bash
git add lib/i18n/server.ts components/providers/i18n-provider.tsx lib/supabase/__tests__/proxy-locale.test.ts app/__tests__/i18n-layout.contract.test.ts
git add -p -- lib/supabase/proxy.ts proxy.ts app/layout.tsx
git diff --cached --check
git commit -m "feat: resolve locale during auth refresh"
```

---

### Task 4: Shared language switcher and role-shell access

**Files:**
- Create: `components/shared/language-switcher.tsx`
- Create: `components/shared/__tests__/language-switcher.test.tsx`
- Modify: `app/login/page.tsx`
- Modify: `app/customer/layout.tsx`
- Modify: `app/guest/layout.tsx`
- Modify: `components/layout/vendor-sidebar.tsx`
- Modify: `app/admin/layout.tsx`
- Modify: `components/profile/profile-sections.tsx`
- Create: `components/shared/__tests__/language-entry-points.contract.test.ts`
- Modify: `app/i18n/locales/en/common.json`, `app/i18n/locales/zh-CN/common.json`, `app/i18n/locales/ms/common.json`
- Modify: `app/i18n/locales/en/auth.json`, `app/i18n/locales/zh-CN/auth.json`, `app/i18n/locales/ms/auth.json`
- Modify: `app/i18n/locales/en/customer.json`, `app/i18n/locales/zh-CN/customer.json`, `app/i18n/locales/ms/customer.json`
- Modify: `app/i18n/locales/en/vendor.json`, `app/i18n/locales/zh-CN/vendor.json`, `app/i18n/locales/ms/vendor.json`
- Modify: `app/i18n/locales/en/admin.json`, `app/i18n/locales/zh-CN/admin.json`, `app/i18n/locales/ms/admin.json`

**Interfaces:**
- Consumes: `AppLocale`, `APP_LOCALES`, `POST /api/locale`, and the i18n client provider.
- Produces: `LanguageSwitcher({ compact?: boolean, className?: string })`.

- [ ] **Step 1: Write failing switcher behavior tests**

Cover native language labels, selected state, keyboard-accessible radio/select semantics, disabled state during save, success flow calling `router.refresh()` without `router.push`, and error feedback without changing the visible selection.

- [ ] **Step 2: Write failing shell-entry contract tests**

Assert the shared component is rendered by login, customer, guest, vendor sidebar, and admin layout, and that Profile Sections contains one `Language & region` card. Assert no shell defines a second independent language list.

- [ ] **Step 3: Run tests and confirm red**

```bash
npx vitest run components/shared/__tests__/language-switcher.test.tsx components/shared/__tests__/language-entry-points.contract.test.ts
```

Expected: FAIL because the shared switcher is missing.

- [ ] **Step 4: Implement `LanguageSwitcher`**

Use native labels from one constant and translated chrome from `common`. On selection, `POST /api/locale`, keep the previous locale until a 200 response, announce success through the existing `useActionFeedback` provider and the component's translated `aria-live` message, then call `router.refresh()`. Preserve current path, query, form state owned outside the component, and scroll.

- [ ] **Step 5: Integrate the switcher into all shells**

- Login/account creation: visible compact control above or beside the auth card.
- Customer/guest: account menu item and Profile `Language & region` card.
- Vendor/outlet manager: sidebar footer above Sign out.
- Admin/approver/super admin: sidebar footer above Sign out.

Do not change role checks, fixed sidebars, sign-out behavior, or navigation dimensions.

- [ ] **Step 6: Translate shell-owned copy and run parity tests**

Move shell navigation, account labels, sign-out, loading, notifications, cart, language labels, and profile-language descriptions into the correct namespace. Keep route definitions stable; replace `label` strings with translation keys where arrays are shared.

Run:

```bash
npx vitest run components/shared/__tests__/language-switcher.test.tsx components/shared/__tests__/language-entry-points.contract.test.ts lib/i18n/__tests__/resources.test.ts app/admin/__tests__/layout.contract.test.ts lib/customer/__tests__/header-navigation.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit Task 4**

```bash
git add components/shared/language-switcher.tsx components/shared/__tests__/language-switcher.test.tsx components/shared/__tests__/language-entry-points.contract.test.ts
git add -p -- app/login/page.tsx app/customer/layout.tsx app/guest/layout.tsx components/layout/vendor-sidebar.tsx app/admin/layout.tsx components/profile/profile-sections.tsx app/i18n/locales
git diff --cached --check
git commit -m "feat: add shared language controls"
```

---

### Task 5: Shared components, formatting, statuses, and validation copy

**Files:**
- Create: `lib/i18n/format.ts`
- Create: `lib/i18n/__tests__/format.test.ts`
- Modify: `components/providers/action-feedback.tsx`
- Modify: `components/shared/empty-state.tsx`
- Modify: `components/shared/status-badge.tsx`
- Modify: `components/shared/notification-bell.tsx`
- Modify: `components/shared/notification-center.tsx`
- Modify: `components/shared/ticket-thread.tsx`
- Modify: `components/shared/chatbot-widget.tsx`
- Modify: `components/vendor/pagination-controls.tsx`
- Modify: `components/vendor/compact-filter-bar.tsx`
- Modify: `components/admin/segmented-filter.tsx`
- Modify: `components/admin/batch-action-bar.tsx`
- Modify: `components/admin/confirm-dialog.tsx`
- Modify: `lib/customer/header-navigation.ts`
- Modify: `lib/customer/discovery-categories.ts`
- Modify: `backend/domains/preferences.ts`
- Modify: `app/i18n/locales/en/common.json`, `app/i18n/locales/zh-CN/common.json`, `app/i18n/locales/ms/common.json`
- Modify: `app/i18n/locales/en/customer.json`, `app/i18n/locales/zh-CN/customer.json`, `app/i18n/locales/ms/customer.json`
- Modify: `app/i18n/locales/en/vendor.json`, `app/i18n/locales/zh-CN/vendor.json`, `app/i18n/locales/ms/vendor.json`
- Modify: `app/i18n/locales/en/admin.json`, `app/i18n/locales/zh-CN/admin.json`, `app/i18n/locales/ms/admin.json`

**Interfaces:**
- Produces: `formatDate(value, locale, options)`, `formatDateTime`, `formatNumber`, and `formatMYR` using `Intl` with `MYR` fixed.
- Converts shared label constants from English display text to stable translation keys.

- [ ] **Step 1: Write failing formatter and shared-copy tests**

Assert `formatMYR(70, locale)` represents MYR/RM in all locales without changing the numeric value, dates use locale ordering, status keys translate, and shared navigation/category/preference arrays contain keys rather than English presentation strings.

- [ ] **Step 2: Run tests and confirm red**

```bash
npx vitest run lib/i18n/__tests__/format.test.ts lib/customer/__tests__/header-navigation.test.ts backend/domains/__tests__/preferences.test.ts
```

Expected: FAIL until formatting and key-based labels exist.

- [ ] **Step 3: Implement shared formatters and key-based labels**

Use `Intl.NumberFormat(locale, { style: "currency", currency: "MYR" })`, `Intl.DateTimeFormat`, and `Intl.NumberFormat`. Keep stored enum values unchanged; only map them to translation keys at render time.

- [ ] **Step 4: Migrate shared components**

Replace fixed headings, actions, empty states, statuses, filter labels, pagination text, notification controls, ticket controls, and accessibility labels with translation lookups. Keep chatbot answer-language detection intact; translate only widget chrome and network/error messages through the UI locale.

- [ ] **Step 5: Run shared regression tests**

```bash
npx vitest run lib/i18n/__tests__ components/shared/__tests__ lib/customer/__tests__/header-navigation.test.ts backend/domains/__tests__/preferences.test.ts
npx tsc --noEmit
```

Expected: PASS.

- [ ] **Step 6: Commit Task 5**

```bash
git add lib/i18n/format.ts lib/i18n/__tests__/format.test.ts
git add -p -- components/providers/action-feedback.tsx components/shared/empty-state.tsx components/shared/status-badge.tsx components/shared/notification-bell.tsx components/shared/notification-center.tsx components/shared/ticket-thread.tsx components/shared/chatbot-widget.tsx components/vendor/pagination-controls.tsx components/vendor/compact-filter-bar.tsx components/admin/segmented-filter.tsx components/admin/batch-action-bar.tsx components/admin/confirm-dialog.tsx lib/customer/header-navigation.ts lib/customer/discovery-categories.ts backend/domains/preferences.ts app/i18n/locales
git diff --cached --check
git commit -m "feat: localize shared interface components"
```

---

### Task 6: Authentication, lifecycle, invitations, and development routes

**Files:**
- Modify: `app/login/page.tsx`
- Modify: `app/reset-password/page.tsx`
- Modify: `app/account-restore/page.tsx`
- Modify: `app/account-suspended/page.tsx`
- Modify: `app/outlet-manager-invitations/[token]/page.tsx`
- Modify: `app/vendor-invite/page.tsx`
- Modify: `components/vendor/vendor-invite-account-step.tsx`
- Modify: `components/vendor/vendor-invite-client.tsx`
- Modify: `components/vendor/vendor-invite-details-step.tsx`
- Modify: `components/vendor/vendor-invite-phone-step.tsx`
- Modify: `components/vendor/vendor-invite-wizard.tsx`
- Modify: `components/vendor/register-vendor-form.tsx`
- Modify: `app/dev/page.tsx`
- Modify: `app/dev/customize/page.tsx`
- Modify: `app/dev/explore/page.tsx`
- Modify: `app/dev/listings/page.tsx`
- Create: `app/__tests__/auth-lifecycle-i18n.contract.test.ts`
- Modify: `app/i18n/locales/en/auth.json`, `app/i18n/locales/zh-CN/auth.json`, `app/i18n/locales/ms/auth.json`
- Modify: `app/i18n/locales/en/vendor.json`, `app/i18n/locales/zh-CN/vendor.json`, `app/i18n/locales/ms/vendor.json`
- Modify: `app/i18n/locales/en/customer.json`, `app/i18n/locales/zh-CN/customer.json`, `app/i18n/locales/ms/customer.json`

**Interfaces:**
- Consumes: server/client translation runtime and shared formatters.
- Produces: complete three-locale fixed copy for all unauthenticated, invitation, lifecycle, and dev routes.

- [ ] **Step 1: Write the failing contract test**

Enumerate every file above and assert each imports the translation helper or renders only child components that do. Explicitly reject the previous English auth titles/actions and lifecycle headings as JSX literals.

- [ ] **Step 2: Confirm red**

```bash
npx vitest run app/__tests__/auth-lifecycle-i18n.contract.test.ts
```

Expected: FAIL on the current English literals.

- [ ] **Step 3: Translate all fixed copy without changing flows**

Move headings, descriptions, field labels, buttons, loading/error/success messages, invitation steps, validation messages, and accessibility labels to `auth` or `vendor`. Preserve OAuth destinations, Demo account identity data, OTP behavior, account restore/suspension actions, and invitation token handling.

- [ ] **Step 4: Verify parity and auth regressions**

```bash
npx vitest run app/__tests__/auth-lifecycle-i18n.contract.test.ts lib/i18n/__tests__/resources.test.ts app/api/auth/__tests__/demo-signin.route.test.ts components/providers/__tests__/auth-demo-session.test.ts components/vendor/__tests__/vendor-invite-wizard.test.tsx
```

Expected: PASS.

- [ ] **Step 5: Commit Task 6**

```bash
git add app/__tests__/auth-lifecycle-i18n.contract.test.ts
git add -p -- app/login app/reset-password app/account-restore app/account-suspended app/outlet-manager-invitations app/vendor-invite app/dev components/vendor/vendor-invite-account-step.tsx components/vendor/vendor-invite-client.tsx components/vendor/vendor-invite-details-step.tsx components/vendor/vendor-invite-phone-step.tsx components/vendor/vendor-invite-wizard.tsx components/vendor/register-vendor-form.tsx app/i18n/locales
git diff --cached --check
git commit -m "feat: localize authentication and invitation flows"
```

---

### Task 7: Customer and guest pages

**Files:**
- Modify (customer route inventory): `app/customer/activity/[id]/activity-detail-client.tsx`, `app/customer/activity/[id]/bodies/activity-body.tsx`, `app/customer/activity/[id]/bodies/booking-panel.tsx`, `app/customer/activity/[id]/bodies/food-body.tsx`, `app/customer/activity/[id]/bodies/retail-body.tsx`, `app/customer/activity/[id]/bodies/stay-body.tsx`, `app/customer/activity/[id]/page.tsx`, `app/customer/activity/page.tsx`, `app/customer/affiliate/page.tsx`, `app/customer/bookings/[id]/page.tsx`, `app/customer/calendar/page.tsx`, `app/customer/cart/page.tsx`, `app/customer/chat/[threadId]/page.tsx`, `app/customer/chat/page.tsx`, `app/customer/checkout/page.tsx`, `app/customer/checkout/simulator/[sessionId]/page.tsx`, `app/customer/design-demo/design-demo-client.tsx`, `app/customer/design-demo/page.tsx`, `app/customer/explore/page.tsx`, `app/customer/for-you/for-you-client.tsx`, `app/customer/for-you/page.tsx`, `app/customer/home-client.tsx`, `app/customer/kyc/page.tsx`, `app/customer/map/map-client.tsx`, `app/customer/map/page.tsx`, `app/customer/notifications/page.tsx`, `app/customer/orders/[id]/page.tsx`, `app/customer/orders/page.tsx`, `app/customer/outlet/[outletId]/page.tsx`, `app/customer/page.tsx`, `app/customer/preferences/page.tsx`, `app/customer/profile/[userId]/page.tsx`, `app/customer/profile/page.tsx`, `app/customer/profile/register-vendor/page.tsx`, `app/customer/profile/wizard-progress.ts`, `app/customer/recommendations/page.tsx`, `app/customer/search/page.tsx`, `app/customer/search/search-client.tsx`, `app/customer/support/[id]/page.tsx`, `app/customer/support/page.tsx`, `app/customer/vendor/[vendorId]/page.tsx`, `app/customer/wallet/page.tsx`, `app/customer/wallet/withdrawals/[id]/page.tsx`, `app/customer/wishlist/page.tsx`, `app/customer/wishlist/wishlist-client.tsx`
- Modify (guest route inventory): `app/guest/activity/[id]/page.tsx`, `app/guest/explore/page.tsx`, `app/guest/vendor/[vendorId]/page.tsx`
- Modify (customer components): `components/customer/activity-card.tsx`, `components/customer/activity-reviews.tsx`, `components/customer/affiliate-clicks-chart.tsx`, `components/customer/ai-tag.tsx`, `components/customer/booking-day-drawer.tsx`, `components/customer/booking-qr-code.tsx`, `components/customer/category-icon.tsx`, `components/customer/chat-thread-panel.tsx`, `components/customer/customer-page-shell.tsx`, `components/customer/destination-preview-modal.tsx`, `components/customer/guest-account-empty-state.tsx`, `components/customer/malaysia-destination-rail.tsx`, `components/customer/outlet-chat-button.tsx`, `components/customer/promotion-spotlight.tsx`, `components/customer/saved-destination-card.tsx`, `components/customer/use-customer-capability-gate.ts`
- Modify (guest/map/outlet/profile components): `components/guest/guest-catalogue.tsx`, `components/map/map-view.tsx`, `components/map/maplibre-map.tsx`, `components/demo-map/discovery-pin-preview.tsx`, `components/demo-map/malaysia-district-map.tsx`, `components/demo-map/malaysia-state-map.tsx`, `components/demo-map/story-map.tsx`, `components/outlet/outlet-block-renderer.tsx`, `components/outlet/outlet-menu.tsx`, `components/outlet/outlet-page-renderer.tsx`, `components/profile/preferences-editor.tsx`, `components/profile/international-phone-input.tsx`
- Modify: `app/i18n/locales/en/customer.json`, `app/i18n/locales/zh-CN/customer.json`, `app/i18n/locales/ms/customer.json`
- Create: `app/customer/__tests__/sitewide-i18n.contract.test.ts`

**Interfaces:**
- Consumes: `customer`/`common` namespaces and locale formatters.
- Produces: three-locale fixed copy for all customer and guest routes, including profile, settings, checkout, wallet, chat, support, recommendations, maps, vendors, outlets, orders, bookings, activity, affiliate, notifications, wishlist, and KYC.

Client pages/components use:

```ts
const { t } = useT("customer");
```

Server pages/components use:

```ts
const { t } = await getServerTranslation("customer");
```

Both forms may read `common` as a fallback namespace; neither may create a page-local language map.

- [ ] **Step 1: Verify the checked-in customer/guest inventory has not drifted**

Run:

```bash
rg --files app/customer app/guest components/customer components/guest components/map components/demo-map components/outlet components/profile | rg '\.(tsx|ts)$' | sort
```

Compare the command output with the exact inventory in this task. Add a newly discovered rendered file to this task and to `CUSTOMER_I18N_FILES`; pure type-only files `app/customer/activity/[id]/bodies/types.ts`, `app/customer/activity/[id]/bodies/index.ts`, and `components/outlet/outlet-block-types.ts` remain excluded because they render no copy.

- [ ] **Step 2: Write the failing customer/guest contract test**

For every inventory file that renders UI, require the appropriate server/client translation helper. Add targeted assertions for high-risk pages: checkout, wallet, KYC, profile, support, booking/order details, maps, filters, pagination, status badges, and guest sign-in gates.

- [ ] **Step 3: Confirm red**

```bash
npx vitest run app/customer/__tests__/sitewide-i18n.contract.test.ts
```

Expected: FAIL with the untranslated file list.

- [ ] **Step 4: Migrate customer and guest copy by feature cluster**

Migrate in this order while keeping one dictionary key per meaning:

1. Profile, preferences, KYC, registration, and account capability gates.
2. Explore, search, map, destination/vendor/outlet pages, wishlist, and recommendations.
3. Cart, checkout, payment simulator, orders, bookings, calendar, and activity.
4. Wallet, affiliate, notifications, chat, and support.

Translate only fixed UI. Preserve vendor/listing names, user messages, recommendation text, addresses, IDs, API payload enum values, and database fields.

- [ ] **Step 5: Run customer regressions and parity**

```bash
npx vitest run app/customer components/customer components/guest components/outlet lib/customer lib/i18n/__tests__/resources.test.ts
npx tsc --noEmit
```

Expected: PASS.

- [ ] **Step 6: Commit Task 7**

```bash
git add app/customer/__tests__/sitewide-i18n.contract.test.ts
git add -p -- app/customer app/guest components/customer components/guest components/map components/demo-map components/outlet components/profile/preferences-editor.tsx components/profile/international-phone-input.tsx app/i18n/locales
git diff --cached --check
git commit -m "feat: localize customer and guest experiences"
```

---

### Task 8: Vendor owner and outlet manager pages

**Files:**
- Modify (vendor routes): `app/vendor/analytics/page.tsx`, `app/vendor/bookings/page.tsx`, `app/vendor/dashboard/page.tsx`, `app/vendor/inbox/page.tsx`, `app/vendor/listings/page.tsx`, `app/vendor/notifications/page.tsx`, `app/vendor/orders/page.tsx`, `app/vendor/outlets/page.tsx`, `app/vendor/products/page.tsx`, `app/vendor/profile/page.tsx`, `app/vendor/register/page.tsx`, `app/vendor/vouchers/page.tsx`, `app/vendor/wallet/page.tsx`
- Modify (layout components not completed by Task 4): `components/layout/vendor-access-gate.tsx`, `components/layout/vendor-header.tsx`
- Modify (vendor components not completed by Tasks 5–6): `components/vendor/action-confirmation-dialog.tsx`, `components/vendor/address-autocomplete.tsx`, `components/vendor/ai-writing-assistant.tsx`, `components/vendor/batch-action-bar.tsx`, `components/vendor/compact-thumbnail.tsx`, `components/vendor/dashboard-filter.tsx`, `components/vendor/dashboard-realtime.tsx`, `components/vendor/order-quick-action.tsx`, `components/vendor/outlet-builder-canvas.tsx`, `components/vendor/outlet-builder-editing.ts`, `components/vendor/outlet-builder-history.ts`, `components/vendor/outlet-builder-inspector.tsx`, `components/vendor/outlet-builder-palette.tsx`, `components/vendor/outlet-builder-ui.ts`, `components/vendor/outlet-form.tsx`, `components/vendor/outlet-manager-panel.tsx`, `components/vendor/outlet-page-builder.tsx`, `components/vendor/outlet-pie-chart.tsx`, `components/vendor/outlet-shop-preview.tsx`, `components/vendor/performance-ranking-card.tsx`, `components/vendor/price-rule-manager.tsx`, `components/vendor/product-details-page.tsx`, `components/vendor/product-form.tsx`, `components/vendor/product-media-uploader.tsx`, `components/vendor/recent-transactions.tsx`, `components/vendor/sales-chart.tsx`, `components/vendor/slot-form.tsx`, `components/vendor/variant-manager.tsx`, `components/vendor/vendor-claim-form.tsx`, `components/vendor/vendor-share-analytics.tsx`, `components/vendor/voucher-csv-builder.tsx`, `components/vendor/voucher-form.tsx`
- Modify (vendor-facing shared components): `components/shared/affiliate-funnel.tsx`, `components/shared/affiliate-insight-card.tsx`, `components/shared/affiliate-rank-card.tsx`, `components/shared/fraud-breakdown-charts.tsx`, `components/shared/fraud-trend-chart.tsx`
- Modify: `app/i18n/locales/en/vendor.json`, `app/i18n/locales/zh-CN/vendor.json`, `app/i18n/locales/ms/vendor.json`
- Create: `app/vendor/__tests__/sitewide-i18n.contract.test.ts`

**Interfaces:**
- Consumes: `vendor`/`common` namespaces and locale formatters.
- Produces: three-locale fixed copy for dashboard, analytics, bookings, inbox, listings, notifications, orders, outlets, products, profile, registration, vouchers, wallet, and all outlet-manager variants.

Client files use `const { t } = useT("vendor")`; Server Components use `const { t } = await getServerTranslation("vendor")`. Both use `common` only for genuinely shared actions/statuses.

- [ ] **Step 1: Build the exact vendor UI inventory and failing contract test**

Run:

```bash
rg --files app/vendor components/vendor components/layout | rg '\.(tsx|ts)$' | sort
```

Compare the output with the exact inventory above, then record those paths in `VENDOR_I18N_FILES`. Files completed by Tasks 4–6 remain covered by their earlier tests. Assert each listed page/rendered component uses `vendor`/`common` translations, with targeted assertions for dashboard cards, tables, filters, pagination, batch actions, forms, drawers, dialogs, charts, builder, vouchers, and wallet statuses.

- [ ] **Step 2: Confirm red**

```bash
npx vitest run app/vendor/__tests__/sitewide-i18n.contract.test.ts
```

Expected: FAIL with untranslated vendor files.

- [ ] **Step 3: Migrate vendor/outlet copy by feature cluster**

Order:

1. Dashboard, analytics, common filters, charts, navigation, and empty/loading/error states.
2. Outlets, outlet managers, page builder, listings, products, variants, slots, and price rules.
3. Orders, bookings, inbox, notifications, vouchers, profile, registration, wallet, and affiliate analytics.

Do not translate business names, outlet names, product content, customer messages, order IDs, API enum values, or money amounts.

- [ ] **Step 4: Run vendor regressions and parity**

```bash
npx vitest run app/vendor components/vendor lib/vendor lib/i18n/__tests__/resources.test.ts
npx tsc --noEmit
```

Expected: PASS.

- [ ] **Step 5: Commit Task 8**

```bash
git add app/vendor/__tests__/sitewide-i18n.contract.test.ts
git add -p -- app/vendor components/layout/vendor-access-gate.tsx components/layout/vendor-header.tsx components/vendor components/shared/affiliate-funnel.tsx components/shared/affiliate-insight-card.tsx components/shared/affiliate-rank-card.tsx components/shared/fraud-breakdown-charts.tsx components/shared/fraud-trend-chart.tsx app/i18n/locales
git diff --cached --check
git commit -m "feat: localize vendor and outlet workspaces"
```

---

### Task 9: Admin, approver, wallet approval, and super-admin pages

**Files:**
- Modify (admin routes): `app/admin/affiliate/page.tsx`, `app/admin/ai-assistant/page.tsx`, `app/admin/catalogue/page.tsx`, `app/admin/chat-reports/page.tsx`, `app/admin/chatbot/page.tsx`, `app/admin/dashboard/page.tsx`, `app/admin/kyc/page.tsx`, `app/admin/recommendations/[id]/page.tsx`, `app/admin/recommendations/page.tsx`, `app/admin/refunds/page.tsx`, `app/admin/reports/payouts/page.tsx`, `app/admin/rewards/page.tsx`, `app/admin/support/page.tsx`, `app/admin/users/page.tsx`, `app/admin/vendors/page.tsx`, `app/admin/wallet/settings/page.tsx`, `app/admin/withdrawals/page.tsx`
- Modify (admin components not completed by Task 5): `components/admin/ai-draft-email-modal.tsx`, `components/admin/approve-reject-bar.tsx`, `components/admin/moderation-flags-panel.tsx`, `components/admin/recommendation-ai-review-panel.tsx`, `components/admin/recommendation-detail-view.tsx`, `components/admin/user-management-drawer.tsx`
- Modify (admin-facing shared components not completed by Task 8): `components/shared/affiliate-qr-code.tsx`, `components/shared/share-button.tsx`
- Modify: `app/i18n/locales/en/admin.json`, `app/i18n/locales/zh-CN/admin.json`, `app/i18n/locales/ms/admin.json`
- Create: `app/admin/__tests__/sitewide-i18n.contract.test.ts`

**Interfaces:**
- Consumes: `admin`/`common` namespaces and locale formatters.
- Produces: three-locale fixed copy for overview, vendor approvals, catalogue review, user management, KYC, withdrawals, refunds, wallet settings, payout reports, recommendation moderation/detail, support, chat reports, affiliate oversight, chatbot oversight, AI Assistant, and rewards.

Client files use `const { t } = useT("admin")`; Server Components use `const { t } = await getServerTranslation("admin")`. Actual action enums and API payloads remain unchanged.

- [ ] **Step 1: Build the exact admin UI inventory and failing contract test**

Run:

```bash
rg --files app/admin components/admin | rg '\.(tsx|ts)$' | sort
```

Compare the output with the exact inventory above, then record those paths in `ADMIN_I18N_FILES`. `app/admin/layout.tsx`, `components/admin/batch-action-bar.tsx`, `components/admin/confirm-dialog.tsx`, and `components/admin/segmented-filter.tsx` remain covered by Tasks 4–5. Require translation access in each listed page/component and add targeted assertions for segmented filters, counts, pagination, batch actions, decision labels, risk/status labels, moderation copy, dialogs, tables, and empty states.

- [ ] **Step 2: Confirm red**

```bash
npx vitest run app/admin/__tests__/sitewide-i18n.contract.test.ts
```

Expected: FAIL with untranslated admin files.

- [ ] **Step 3: Migrate governance copy by feature cluster**

Order:

1. Overview, common shell, counts, filters, pagination, batch actions, status/reason labels.
2. Vendor approvals, catalogue, users, KYC, withdrawals, refunds, wallet settings, and payout reports.
3. Recommendations, support, chat reports, affiliate, chatbot, rewards, and AI Assistant.

Keep permission gates and actual action sets role-specific. Translate labels such as Approve/Reject/Request info/Suspend/Reactivate without adding actions unsupported by the underlying endpoint.

- [ ] **Step 4: Run admin regressions and parity**

```bash
npx vitest run app/admin components/admin lib/i18n/__tests__/resources.test.ts
npx tsc --noEmit
```

Expected: PASS.

- [ ] **Step 5: Commit Task 9**

```bash
git add app/admin/__tests__/sitewide-i18n.contract.test.ts
git add -p -- app/admin components/admin components/shared/affiliate-qr-code.tsx components/shared/share-button.tsx app/i18n/locales
git diff --cached --check
git commit -m "feat: localize governance workspaces"
```

---

### Task 10: Whole-site coverage audit and browser acceptance

**Files:**
- Create: `scripts/verify-i18n-coverage.mjs`
- Create: `scripts/__tests__/verify-i18n-coverage.test.ts`
- Create: `tests/e2e/sitewide-language-switching.spec.ts`
- Modify: `package.json`

**Interfaces:**
- Consumes: every prior task.
- Produces: `npm run verify:i18n` and one cross-role Playwright acceptance suite.

- [ ] **Step 1: Write the failing coverage-script test**

The script accepts repository root and fails when:

- locale namespace key sets differ,
- a translation value is empty,
- a tracked UI inventory file disappears without updating its contract,
- a locale JSON file cannot be parsed.

The test creates a temporary miniature locale tree with one missing Malay key and expects a non-zero result, then adds the key and expects success.

- [ ] **Step 2: Implement `verify:i18n`**

Add:

```json
"verify:i18n": "node scripts/verify-i18n-coverage.mjs"
```

The script must be read-only, deterministic, and print the exact locale/namespace/key or missing inventory file on failure.

Expose a CLI contract of `node scripts/verify-i18n-coverage.mjs [repositoryRoot]`, defaulting `repositoryRoot` to `process.cwd()`. Export `verifyI18nCoverage(root): { ok: boolean; errors: string[] }` for the Vitest file.

- [ ] **Step 3: Write the Playwright acceptance suite**

Cover:

1. Anonymous login page: switch to Chinese, URL stays `/login`, refresh remains Chinese.
2. Guest: switch to Malay, navigation and shared controls become Malay, dynamic vendor names remain unchanged.
3. Customer Demo account: saved Chinese preference survives refresh and sign-out/login.
4. Vendor owner and outlet manager Demo accounts: sidebar and one representative dashboard/list/form page render Malay/Chinese.
5. Admin, approver, and super-admin Demo accounts: sidebar and one representative queue/detail page render the selected locale with role actions unchanged.
6. Query preservation: switch language on a filtered/paginated route and assert pathname plus search parameters are unchanged.
7. First paint: reload a Chinese route and assert `<html lang="zh-CN">` and translated heading before any interaction.

- [ ] **Step 4: Run the complete focused verification once**

```bash
npm run verify:i18n
npx vitest run lib/i18n app/api/locale app/__tests__/i18n-layout.contract.test.ts app/customer/__tests__/sitewide-i18n.contract.test.ts app/vendor/__tests__/sitewide-i18n.contract.test.ts app/admin/__tests__/sitewide-i18n.contract.test.ts scripts/__tests__/verify-i18n-coverage.test.ts
npx playwright test tests/e2e/sitewide-language-switching.spec.ts
npm run lint
npx tsc --noEmit
git diff --check
```

Expected: all focused tests and browser journeys pass; lint has zero errors (existing unrelated warnings may remain); TypeScript and diff checks pass.

If coverage reports a missing key or untranslated source file, stop Task 10 and return the correction to the owning Task 6, 7, 8, or 9 commit before rerunning this final suite once. Task 10 itself owns only the audit script, its unit test, the Playwright suite, and the package script.

- [ ] **Step 5: Perform one focused final review**

Classify only confirmed authorization, privacy, data-loss, broken login/session, missing role coverage, or clear untranslated-page violations as must-fix. Record cosmetic translation refinements and subjective wording improvements as follow-up work rather than starting repeated repair cycles.

- [ ] **Step 6: Commit Task 10**

```bash
git add scripts/verify-i18n-coverage.mjs scripts/__tests__/verify-i18n-coverage.test.ts tests/e2e/sitewide-language-switching.spec.ts
git add -p -- package.json package-lock.json
git diff --cached --check
git commit -m "test: verify sitewide language coverage"
```

---

## Final Scope Boundaries

- This plan completes all web UI roles in three languages; it does not claim email/PDF/CSV translation.
- Content submitted by customers or vendors remains in its original language.
- Chatbot answer-language behavior remains independent; only chatbot UI chrome follows the selected locale.
- Payment amounts, stored enum values, endpoint payloads, permission checks, and route names remain unchanged.
- A page is not considered migrated merely because English fallback works; all three dictionaries must contain its fixed copy before completion.
