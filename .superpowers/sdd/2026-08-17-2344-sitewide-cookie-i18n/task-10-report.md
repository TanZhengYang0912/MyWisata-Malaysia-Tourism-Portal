# Task 10 report — whole-site coverage and browser acceptance

Status: **in progress / not accepted**

## Delivered

- Added `verify:i18n`, its deterministic read-only verifier, and five Vitest cases.
- Added a 10-case Playwright suite covering anonymous, guest, customer, vendor owner, outlet manager, admin, approver, and super-admin locale flows.
- Fixed anonymous locale saving so `/api/locale` does not perform a Supabase auth lookup when no auth cookie exists (`e2cc132`).
- Added an ordinary admin Demo seed identity so role coverage no longer silently skips.
- Expanded and verified Admin/Vendor translations (`72c298d`) and a safe subset of Customer translations (`45d35bd`).

## Verification evidence

- `npm run verify:i18n`: pass.
- Focused locale/API/layout/role contract suite: 179/179 tests pass.
- `npx tsc --noEmit`: pass after the final resource edits.
- `git diff --check`: pass after the final resource edits.
- Direct anonymous `POST /api/locale`: HTTP 200 and `NEXT_LOCALE` cookie written.

## Open blockers

1. The connected Supabase schema does not yet contain `users.preferred_locale` (`42703`). Deploy `supabase/migrations/20260817234400_user_preferred_locale.sql` before authenticated persistence acceptance.
2. The updated Demo seed, including `moderator@demo.local`, has not been run against the remote Demo environment.
3. Browser acceptance is not green: authenticated cases depend on the migration/seed; guest Customer route navigation also stalls in the current Next dev/Supabase environment. The suite remains checked in so these failures cannot be hidden as skips.
4. Confirmed fixed English remains on parts of Customer vendor detail, wallet payout guidance, order metadata/pagination, calendar labels, KYC hints/tier labels, map filters/ARIA, and profile validation/badges. Therefore the approved “all pages in English, Simplified Chinese, and Malay” claim is not yet true.

## Review boundary

A BLOCKING `luna_worker` final review was started with a 10-minute limit, requested to stop once, then interrupted because it did not return. No passing review result is claimed. Two bounded repair passes were completed afterward; project stop rules prevent another open-ended fix/re-review cycle in this task.
