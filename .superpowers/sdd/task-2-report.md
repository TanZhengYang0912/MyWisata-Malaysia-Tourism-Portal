# Task 2 Report: Vendor Notification Recipient Service

## Scope

Implemented approved-vendor recipient resolution and recipient-specific,
idempotent notification emission. Email enqueueing is isolated behind
`lib/vendor-notifications/email.ts`; Task 3 can replace its no-op body with the
real `enqueueVendorEmail` outbox integration without changing the emitter.

## RED

Added the focused scope and emission tests before the production modules and ran:

```text
npx vitest run lib/vendor-notifications/__tests__/scope.test.ts lib/vendor-notifications/__tests__/emit.test.ts
```

The expected failure was observed: both suites failed to import because
`lib/vendor-notifications/scope.ts` and `lib/vendor-notifications/emit.ts` did
not exist (`Cannot find package '@/lib/vendor-notifications/...`), with zero
tests executed.

## GREEN

After implementing the resolver, emitter, and email seam, the focused command
passed:

```text
npx vitest run lib/vendor-notifications/__tests__/scope.test.ts lib/vendor-notifications/__tests__/emit.test.ts
```

Result: `2` files passed; `5` tests passed.

The full verification suite also passed:

```text
npx tsc --noEmit --pretty false
npm test -- --run
git diff --check
```

Results: TypeScript completed with no diagnostics; `131` test files passed and
`1` skipped, with `444` tests passed and `9` skipped; diff check was clean.

## Files changed

- `lib/vendor-notifications/scope.ts`
  - Verifies the vendor exists and is approved.
  - Rejects missing or cross-vendor outlets.
  - Resolves the owner and only managers assigned to the event outlet.
  - Deduplicates by `(userId, role, outletId)`.
- `lib/vendor-notifications/emit.ts`
  - Resolves recipients through the service client.
  - Inserts scoped rows with recipient event keys and `onConflict: 'event_key'` /
    `ignoreDuplicates: true`.
  - Returns inserted notification IDs plus all resolved recipient IDs.
  - Enqueues email only for newly inserted rows when `email` is enabled.
  - Sanitizes metadata to JSON-safe primitive values.
- `lib/vendor-notifications/email.ts`
  - Small mockable Task 3 integration seam; currently a production-safe no-op.
- `lib/vendor-notifications/__tests__/scope.test.ts`
  - Deterministic chained Supabase fake and owner/manager isolation coverage.
- `lib/vendor-notifications/__tests__/emit.test.ts`
  - Deterministic insert fake, idempotency assertions, and one-email-per-recipient
    duplicate-event coverage.

## Self-review and concerns

- The real email outbox implementation is intentionally deferred to Task 3. The
  exact integration point is `enqueueVendorEmail` in
  `lib/vendor-notifications/email.ts`; replace its body or re-export the Task 3
  `lib/email/events.ts` implementation.
- `vendorName` for the future email seam is read from optional metadata and falls
  back to the vendor ID because Task 2's input contract does not include a
  vendor name lookup.
- No UI, API routes, event producers, or remote SQL deployment were changed.

## Commit

`5bfe1335f886c0955c1702b6ed1ef2f68073f65c` (`feat: add vendor notification recipient service`)
