# Sitewide Cookie-Based Internationalization Design

## Status

Approved on 17 Aug 2026; implementation plan created.

## Context

MyWisata currently renders almost all interface copy in English. The chatbot can detect and answer in English, Bahasa Melayu, or Chinese, but that logic is intentionally limited to chatbot messages and is not a site translation system. Customers, guests, vendor owners, outlet managers, admins, approvers, and super admins need one consistent language preference across the web application.

The existing Next.js 16 routes must remain unchanged. Introducing locale-prefixed URLs such as `/zh-CN/customer` would require a broad route, callback, navigation, and authorization migration. The selected direction is therefore cookie-based internationalization with no locale segment in the URL.

## Goals

- Support `English`, `简体中文`, and `Bahasa Melayu` across all web pages and roles.
- Let users switch language from a predictable account/settings surface.
- Preserve the current `/customer`, `/vendor`, `/admin`, `/guest`, and `/login` URLs.
- Render the correct language on the first server response without a client-side English flash.
- Persist the choice for both authenticated and anonymous visitors.
- Fall back safely to English when a translation key is missing.

## Non-goals

- Translating user-generated content, vendor names, descriptions, reviews, chat messages, or recommendation submissions.
- Automatically machine-translating database content.
- Locale-prefixed routes or language-specific SEO URLs.
- Translating generated emails, PDF receipts, CSV exports, or third-party hosted pages in the initial web-UI rollout.
- Adding currencies other than Malaysian Ringgit.

## Supported locales

| Locale | Display name | HTML language |
| --- | --- | --- |
| `en` | English | `en` |
| `zh-CN` | 简体中文 | `zh-CN` |
| `ms` | Bahasa Melayu | `ms` |

Language names are always displayed in their native form so a user can recover even when the current UI language is unfamiliar.

## Locale resolution

The application resolves language in this order:

1. Authenticated user's saved `preferred_locale`.
2. Valid `NEXT_LOCALE` cookie.
3. Best supported match from the browser `Accept-Language` header.
4. English.

When a signed-in user changes language, the application saves both the account preference and the cookie. On sign-in, the saved account preference becomes authoritative and refreshes the cookie. Anonymous and guest users keep only the cookie. Signing out does not erase the cookie, so the login screen remains in the chosen language.

Invalid or unsupported locale values are ignored and resolve to English.

## User experience

### Language control

A shared `LanguageSwitcher` presents the three native language names as a radio/select menu. Selecting a language:

1. Updates the preference.
2. Refreshes the current route without changing its URL or scroll target.
3. Preserves active filters, query parameters, and the user's current workflow.

The control is available from:

- Customer and guest account menu, with a full `Language & region` card in profile/settings.
- Vendor owner and outlet manager sidebar footer/account area.
- Admin, approver, and super-admin sidebar footer/account area.
- Login and account-creation screens.

The switcher is globally accessible through each role's shell; it does not need to be duplicated in every page body.

### Translation boundary

Translate system-owned interface copy, including navigation, headings, buttons, form labels, validation messages, empty states, filters, pagination, status labels, dialogs, and accessibility labels.

Do not translate user-owned or vendor-owned content. A Chinese UI can therefore display an English vendor description exactly as submitted. Existing chatbot language detection remains responsible for chatbot replies and is not used as the UI locale source.

### Formatting

Dates, times, counts, and currency use the resolved locale through `Intl`. Currency remains `MYR`/`RM`; changing language does not change financial values or payout behavior.

## Architecture

### Translation runtime

Use `next-i18next` v16 in no-locale-path mode. Translation resources are bundled by namespace and loaded for the resolved locale. The root layout provides locale and resources to Server and Client Components and sets `<html lang>` correctly.

The existing `proxy.ts` already refreshes Supabase authentication. Locale detection is composed into that proxy flow rather than replacing or bypassing `updateSession`. After session refresh, the proxy reads the authenticated user's `preferred_locale` when a user exists, resolves the final locale, and forwards it through the request header expected by the translation runtime. This prevents a client-side language flash.

### Modules

- `i18n.config.ts`: supported locales, English fallback, namespaces, and no-locale-path behavior.
- `lib/i18n/locale.ts`: locale validation and precedence rules.
- `lib/i18n/server.ts`: server-side locale/resource access.
- `components/providers/i18n-provider.tsx`: client translation context.
- `components/shared/language-switcher.tsx`: shared accessible control.
- `app/i18n/locales/{locale}/{namespace}.json`: translation resources.
- `app/api/locale/route.ts`: one validated update boundary for anonymous and authenticated language changes. It always updates the locale cookie and additionally updates the signed-in user's account preference.

The translation runtime must not depend on the chatbot's heuristic detector.

### Namespaces

Translation files are split by stable product area:

- `common`: shared buttons, statuses, pagination, validation, and accessibility copy.
- `auth`: login, registration, verification, and account recovery.
- `customer`: customer and guest discovery/account flows.
- `vendor`: vendor owner and outlet manager flows.
- `admin`: admin, approver, wallet approval, and super-admin flows.

Keys describe meaning rather than English wording, for example `common.actions.save` rather than `common.save_button_text`.

## Persistence and data model

Add nullable `preferred_locale` to `public.users` with a check constraint limiting values to `en`, `zh-CN`, and `ms`. Null means the user has not made an explicit account choice and the cookie/browser fallback can apply.

The authenticated update path verifies the Supabase user and updates only that user's row. Existing RLS remains authoritative. The locale column is not exposed on public contributor profiles.

Language must not be stored in `preference_survey_responses`; travel preferences affect recommendations, while UI language is an account setting shared by every role.

## Data flow

### Anonymous request

1. Proxy reads `NEXT_LOCALE` or `Accept-Language` and forwards the resolved locale to the root layout.
2. Root layout loads the matching translation resources.
3. User changes language; the switcher writes the cookie and refreshes the route.

### Authenticated request

1. Supabase session is refreshed by the existing proxy flow.
2. The proxy reads the authenticated user's `preferred_locale` when available.
3. The locale resolver selects the account preference, then cookie/browser fallback, and forwards the resolved locale to the root layout.
4. A language change calls the shared locale API, which updates the user row and cookie before the client refreshes the current route.

If the account preference cannot be loaded, the page still renders using the cookie/browser fallback. A failed save shows non-blocking feedback and keeps the last confirmed locale.

## Error handling

- Missing keys render the English value and are reported in development/test output.
- Malformed locale cookies are replaced by the resolved fallback.
- Failed account persistence does not sign the user out or block navigation.
- Translation resource loading failures fall back to the English namespace.
- Locale changes never alter authorization, role routing, form data, filters, or financial calculations.

## Accessibility

- Set the document `lang` attribute on the server response.
- Give the language control a translated accessible label and keyboard-operable radio/select semantics.
- Keep language names in their native spelling.
- Announce successful language changes through the existing action-feedback system in authenticated shells and an `aria-live` status on login/guest screens.
- Verify Chinese font fallback and line wrapping without reducing the established UI font sizes.

## Rollout

Implementation is one feature delivered in bounded phases:

1. Locale runtime, persistence, root provider, proxy composition, and shared switcher.
2. Shared shells, authentication, common components, and status/validation copy.
3. Customer and guest pages.
4. Vendor owner and outlet manager pages.
5. Admin, approver, wallet approval, and super-admin pages.
6. Missing-key audit and role-by-role browser verification.

English fallback may be used while migrating internally, but the feature is not considered complete until every reachable page shell and page-owned fixed string is covered in all three locales.

## Expected implementation surface

Likely new files:

- `i18n.config.ts`
- `lib/i18n/locale.ts`
- `lib/i18n/server.ts`
- `components/providers/i18n-provider.tsx`
- `components/shared/language-switcher.tsx`
- `app/api/locale/route.ts`
- `app/i18n/locales/en/*.json`
- `app/i18n/locales/zh-CN/*.json`
- `app/i18n/locales/ms/*.json`
- one Supabase migration for `users.preferred_locale`
- focused unit, API, contract, and end-to-end tests

Likely modified integration points:

- `app/layout.tsx`
- `proxy.ts` and `lib/supabase/proxy.ts`
- `components/providers/auth.tsx`
- `app/login/page.tsx`
- `app/customer/layout.tsx`
- `components/layout/vendor-sidebar.tsx`
- `app/admin/layout.tsx`
- `components/profile/profile-sections.tsx`
- page and shared-component files containing system-owned UI copy
- `package.json` and lockfile for the selected i18n runtime

This work must not refactor unrelated business logic, role permissions, or data access.

## Testing and acceptance criteria

- Locale resolver tests cover account, cookie, browser, invalid value, and English fallback precedence.
- API/RLS tests prove users can update only their own locale and unsupported values are rejected.
- Translation-resource tests confirm all three locales expose the same keys per namespace.
- Component tests verify the switcher updates preference and preserves the current route/query.
- Contract tests verify all role shells expose the language control.
- Browser tests cover guest, customer, vendor owner, outlet manager, admin, approver, and super-admin sessions.
- Refreshing and signing out/in preserve the expected language.
- No English flash appears on a Chinese or Malay first render.
- Missing translations fall back to English without breaking the page.
- Existing authorization, login, filters, pagination, checkout, wallet, and moderation flows continue to work.
- `npm run lint`, `npx tsc --noEmit`, focused tests, and relevant browser journeys pass before handoff.

## Risks and mitigations

- **Large hardcoded-copy surface:** migrate by namespace and use key-parity tests plus a final source audit.
- **Supabase proxy regression:** compose locale handling with the current auth response and test cookie/session preservation together.
- **Authenticated-request lookup cost:** select only `preferred_locale` for the authenticated user, avoid joins, and measure the added proxy latency before completing rollout.
- **Server/client mismatch:** resolve locale on the server and hydrate the client provider with the same locale/resources.
- **Partial translation:** English fallback prevents broken pages, while acceptance criteria prevent declaring the full rollout complete prematurely.
- **Long Chinese or Malay labels:** test common tables, sidebars, filters, dialogs, and mobile layouts in every role.
- **Stale account preference:** update the account row and locale cookie as one user action, and refresh only after both complete or a handled fallback is chosen.
