# Fix Anonymous Catalogue Access

**Status:** Implemented, verified, and deployed to the linked database on 2026-09-06.

## Context

The login route renders the global `CartProvider`, which loads the public product catalogue. After staff permission enforcement was deployed, anonymous catalogue reads fail with PostgreSQL error `42501 permission denied for function has_staff_permission`. The Vendor read policy is shared by `anon` and `authenticated` while referencing a function whose execution is intentionally revoked from `anon`. The rejected Supabase error object is also not caught by the initial cart catalogue load, so Next.js reports an unhelpful `[object Object]` runtime error.

## Decisions

- Keep `has_staff_permission(UUID, TEXT)` unavailable to `anon`.
- Replace the shared Vendor read policy with separate anonymous and authenticated policies.
- Anonymous users may read only approved Vendors.
- Authenticated users retain approved, owned, or explicitly permitted Vendor visibility.
- Treat catalogue hydration as best-effort in `CartProvider`; a failed read yields an empty activity list without an unhandled rejection.

## Scope

### Files to create

- `supabase/migrations/20260906030400_fix_anonymous_vendor_reads.sql`
- `supabase/migrations/__tests__/20260906030400_fix_anonymous_vendor_reads.test.ts`
- `components/providers/__tests__/cart-state-errors.test.ts`

### Files to modify

- `components/providers/cart.tsx` — catch only the initial `getActivities()` hydration failure.
- `supabase/migrations/__tests__/canonical-history.test.ts` — register the forward migration.

### Files not being touched

- Staff Roles UI, APIs, and assignment RPCs.
- Historical migrations, including `20260905073500_staff_permission_enforcement.sql`.
- Product, outlet, cart, or checkout data models.
- Existing unrelated dirty-worktree files.

### Dependencies and database changes

- No new dependency.
- One forward-only RLS migration that replaces only Vendor SELECT policies.

## Risks

- Accidentally granting anonymous execution of staff authorization functions.
- Expanding anonymous Vendor visibility beyond `status = 'approved'`.
- Removing owner or dedicated staff visibility for authenticated users.

## Verification

- Run the two focused regression tests first and confirm they fail before implementation.
- Run migration contract tests and canonical-history tests.
- Run the provider regression test.
- Re-run the real anonymous `getActivities()` probe after applying the migration.
- Reload the login route and confirm the Next.js runtime overlay is gone.
- Run `npm run lint`, `npx tsc --noEmit`, and `git diff --check`.

## Verification record

- Confirmed the original anonymous catalogue probe failed with PostgreSQL `42501 permission denied for function has_staff_permission` before the repair.
- Confirmed the focused regression tests failed before implementation and passed afterward.
- Applied only `20260906030400_fix_anonymous_vendor_reads.sql` to the linked database.
- Confirmed an anonymous `getActivities()` call succeeds with 293 activities after deployment.
- Reloaded both the anonymous login route and the authenticated Access Control route without a runtime overlay or browser error log.
- Focused permission review found no must-fix findings. A separate authenticated cart-load rejection guard remains follow-up work outside this repair.
