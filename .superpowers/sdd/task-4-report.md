# Task 4 report — Server-authored capability snapshot and typed denial recovery

## Status

Completed and committed as `feat: expose effective capability snapshots`.

## Delivered

- `/api/auth/me` derives verification facts from authenticated server data and returns a Task 3 resolver-authored capability snapshot plus entitlement generation. Legacy `tier` remains payload compatibility only.
- The legacy tier-shaped server adapter is explicitly fail-closed (`POLICY_UNAVAILABLE`) so it cannot authorize a capability while protected API routes migrate in Task 7.
- Typed denials serialize and validate a capability, blocker, zero/one/multiple safe qualification paths, and entitlement generation.
- Capability recovery sanitizes both return intent and supplied qualification paths, renders one action per safe path, refreshes auth after API denials, and reopens the same gate dialog.
- Auth context now retains server-provided facts, snapshot, and generation. Legacy alias keys remain compatibility views of the same server decisions.

## TDD evidence

- RED: `npx vitest run app/api/auth/me/__tests__/route.test.ts lib/auth/__tests__/customer-capabilities-server.test.ts lib/auth/__tests__/customer-capability-error.test.ts components/customer/__tests__/customer-capability-gate-dialog.test.tsx` failed with eight expected contract failures before implementation.
- RED: zero-path denial and profile-or-KYC copy fallback tests failed before their minimal additions.
- GREEN: the focused command passes 13 tests.

## Verification

- Focused Vitest: 13 passed.
- `npx tsc --noEmit`: passed.
- Scoped ESLint: passed with no warnings/errors.
- `git diff --check`: passed.

## Scope and follow-up

- No dependencies or database changes.
- Existing protected API routes still call the compatibility adapter with tier-shaped objects; by design they now deny until Task 7 migrates them to the user-id resolver. This is a safe temporary fail-closed state, not retained tier authorization.
