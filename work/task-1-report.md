# Historical implementation report

Commit `3553d8c` added the pure KYC types, structured review reason validator, versioned HMAC hash helper, and five focused Vitest assertions. The recorded focused test run passed: 2 files, 5 tests.

This report is historical context; verify all claims from the diff.

## Runtime catalog validation fix (2026-07-14)

The review found that TypeScript's `KycReviewReasonCode` union did not enforce the approved catalog at runtime: an unapproved value passed to `validateReviewReason('reject', ...)` returned `{ ok: true }`.

### RED

Added the focused regression assertion:

```ts
expect(validateReviewReason('reject', 'unapproved' as KycReviewReasonCode, null)).toEqual({
  ok: false,
  error: 'reason_code_not_allowed',
});
```

Command:

```text
npx vitest run lib/kyc/__tests__/review-reasons.test.ts
```

Result: exit code 1; 1 test failed and 3 passed. The new test failed as intended because the received value was `{ ok: true }`, rather than `{ ok: false, error: 'reason_code_not_allowed' }`.

### GREEN

Added a `KYC_REVIEW_REASON_CODES.includes(reasonCode)` guard at the start of `validateReviewReason()`. This rejects unapproved runtime values for both `reject` and `request_info` before applying the existing action-specific and `other` detail rules.

### Verification

Command:

```text
npx vitest run lib/kyc/__tests__/review-reasons.test.ts lib/kyc/__tests__/hash.test.ts
```

Result: exit code 0; 2 test files passed and 6 tests passed (0 failed), in 592 ms.
