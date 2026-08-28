# Guest public pages with login-gated actions

Status: complete

## Context

Guest users previously entered a separate `/guest/*` catalogue, which made the
guest experience visually and functionally different from the customer flow.
Guests now see the customer browse, vendor, listing, wallet, recommendation,
and affiliate surfaces while account-owned actions redirect to sign-in.

## Decisions and scope

- Reuse existing `/customer/*` components for unauthenticated public paths.
- Keep server-side authorization unchanged; capability gates provide the
  interaction and preserve a safe return path after sign-in.
- Keep private detail/account routes and APIs protected. No database or
  dependency changes are needed.
- Preserve `/guest/*` links as compatibility redirects to customer pages.

## Verification

- Added unit coverage for public-path matching and private subroutes.
- Updated guest route contract and Playwright expectations for the shared UI.
- `npx tsc --noEmit` passes.
- `npx vitest run` passes: 475 files, 2044 tests (7 files / 20 tests skipped).
- `npm run lint` passes with existing warnings only (0 errors).
