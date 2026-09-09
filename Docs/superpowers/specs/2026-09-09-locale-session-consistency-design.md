# Locale and Login Session Consistency Design

**Date:** 2026-09-09

**Status:** Approved for implementation

## Context

The shared language selector can show one locale while the page renders another because it copies `i18n.resolvedLanguage` into component state once and later updates that copy independently. A locale save immediately changes the select value, while the translated page changes only after a server refresh. The same stale state can persist when a role layout mounts during a locale transition.

The login page can also be opened while an older Supabase session is still active. A failed email/password or demo-account sign-in reports an error but does not explicitly clear that older session. A later role-based navigation can therefore continue as the previous Super Admin even though the user attempted to enter a customer account.

## Decisions

### One displayed locale source

`LanguageSwitcher` will render its selected option directly from the normalized `i18n.resolvedLanguage`. It will not keep an independent confirmed-locale state. During persistence the select remains disabled and continues showing the currently rendered locale. After `/api/locale` returns success, `router.refresh()` obtains the server-confirmed account/cookie locale; the i18n provider and select then update from the same value.

The existing `/api/locale` endpoint, authenticated account preference, locale cookie, proxy precedence, translations, and feedback messages remain unchanged.

### Failed sign-in clears stale local identity

If normal email/password sign-in fails, the login page will make a best-effort local Supabase sign-out before presenting the generic error. If demo-account sign-in fails, `AuthProvider.switchUser` will do the same before throwing. Sign-out failure must not replace or expose the original generic sign-in error.

Only failure paths change. Successful email/password, demo, Google, guest, callback, and role-destination behavior remain unchanged.

## Files and boundaries

Modify:

- `components/shared/language-switcher.tsx`
- `components/shared/__tests__/language-switcher.test.tsx`
- `app/login/page.tsx`
- `app/login/__tests__/signin-feedback.test.ts`
- `components/providers/auth.tsx`
- `components/providers/__tests__/auth-state-errors.test.ts`

Do not modify:

- locale JSON catalogs or translation copy
- `app/api/locale/route.ts`
- `lib/supabase/proxy.ts`
- role priorities, permissions, destination mappings, middleware/proxy routing, or database migrations
- unrelated demo-account seed and role-repair work already present in the working tree

New dependencies: none.

Database changes: none.

## Error handling

- Locale persistence failure keeps the currently rendered locale and reports the existing localized save error.
- Failed authentication clears only the local browser session as a best-effort safety action.
- Cleanup failure is swallowed so the UI still presents the existing generic authentication error without leaking provider details.

## Testing

1. Add a failing render test proving a mounted language selector follows an externally changed `i18n.resolvedLanguage`.
2. Update the successful-save test so the select changes only after the provider-confirmed locale changes.
3. Add failing contracts proving both normal and demo sign-in failure paths invoke local sign-out before surfacing the error.
4. Run focused locale, provider, auth, login, and proxy tests.
5. Reproduce the user flow in a browser: switch Customer Alice among English, Simplified Chinese, and Malay; verify select, `<html lang>`, page copy, account, and URL agree.

## Acceptance criteria

- The selected option and rendered fixed UI always report the same confirmed locale after a switch completes.
- English, Simplified Chinese, and Malay switches remain on the current route and current successful account.
- A failed normal or demo sign-in cannot leave an older local Super Admin session active.
- Successful authentication and role routing are unchanged.
- No new dependency or database change is introduced.
