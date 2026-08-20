# Role-aware Login Redirect

Status: Complete

## Context

Successful authentication can preserve a role-incompatible `next` path. A customer who authenticates from `/login?next=/admin/dashboard` is sent to the admin area, where the role guard sends the browser back to the same login URL. Google OAuth and email/password login therefore appear to fail even though the Supabase session was created.

The repository-required `docs/requirements.md`, `docs/auth.md`, `docs/architecture.md`, `docs/testing.md`, and `docs/coding-standards.md` files are not present in this checkout. This plan follows the current authentication implementation and existing authentication tests instead.

## Decisions

- Resolve the authenticated user's primary role in the existing `/auth/callback` route through the RLS-safe `get_my_roles()` RPC.
- Apply the existing `postLoginDestination` rule to both Google OAuth and email/password sign-in.
- Preserve safe role-neutral destinations such as `/reset-password`, `/vendor-invite`, and outlet-manager invitation pages.
- Fall back to the root role router if the role lookup fails; do not trust the requested protected destination without a resolved role.
- Keep the existing route guards as defense in depth.

## Scope

Files to modify:

- `app/auth/callback/route.ts`: update `GET` to load the authenticated user and role assignments, then choose a role-compatible destination.
- `app/login/page.tsx`: update password sign-in, immediate sign-up sessions, and OTP completion to finish through the shared callback route.
- `lib/auth/post-login-destination.ts`: update `postLoginDestination` to preserve safe role-neutral paths while rejecting mismatched customer, vendor, and admin namespaces.
- `lib/auth/__tests__/post-login-destination.test.ts`: add role mismatch and role-neutral redirect regression coverage.
- `app/login/__tests__/invite-return.test.ts`: assert email sign-in uses the shared callback.

Files to add:

- `app/auth/callback/__tests__/route.test.ts`: cover customer/admin mismatch, valid role destinations, neutral invitation/reset paths, OAuth exchange failure, missing sessions, and role lookup failure.

Files not touched:

- `components/providers/auth.tsx` and the existing role guards.
- Supabase provider configuration, authentication identities, database schema, migrations, RLS policies, and stored account/profile data.
- Demo account sign-in, account lifecycle gates, and unrelated application routes.

New dependencies: none.

Database changes: none.

## Risks

- Invitation and password-reset returns could regress if all non-role paths were treated as invalid; focused tests will keep these destinations intact.
- A transient role-query failure must not forward the user into a requested protected namespace; the callback will fall back to `/`.
- Accounts without a role assignment retain the existing default role of `customer`.
- The callback must continue rejecting unsafe external or protocol-relative `next` values through the existing path validation.

## Phases

1. Add a failing callback regression test for a customer requesting `/admin/dashboard`.
2. Resolve the authenticated role through `get_my_roles()` in the callback and apply the existing destination helper.
3. Add a failing helper test for safe role-neutral destinations and minimally extend the helper.
4. Add a failing login contract test and route email/password success through the callback.
5. Add callback error and valid-destination coverage, then perform one focused security re-review.

## Verification

1. Run the focused callback, destination, and login tests during each red/green cycle.
2. Run all affected authentication tests.
3. Run `npm run lint`.
4. Run `npx tsc --noEmit`.
5. Run `git diff --check` and inspect the final diff for unrelated changes or sensitive-data exposure.

## Verification result

- Red/green regression: customer plus `/admin/dashboard`, registration/OTP direct redirects, and the RLS-sensitive role lookup failed before their fixes and passed afterward.
- Focused authentication tests: passed (16 files, 67 tests).
- An earlier full Vitest run passed (408 files and 1,741 tests; 7 files and 20 tests skipped); after the final focused repair, the affected authentication suite was rerun instead of repeating the broad suite.
- `npm run lint`: passed with 29 existing warnings and no errors; no warning is in a modified file.
- `npx tsc --noEmit`: passed.
- `git diff --check`: passed.
- Independent `luna_worker` authentication review found and drove two must-fix repairs; the single focused re-review found no remaining authorization, privacy, or redirect must-fix findings.
