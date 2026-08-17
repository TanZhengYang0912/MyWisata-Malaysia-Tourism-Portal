# Task 7 implementation report

## Scope and inventory

Task 7 was limited to customer/guest routes and the customer, guest, map, demo-map, outlet, and profile components named by the brief, the three customer locale resources, this contract test, and this report. The exact inventory was run before edits:

```text
rg --files app/customer app/guest components/customer components/guest components/map components/demo-map components/outlet components/profile | rg '\.(tsx|ts)$' | sort
```

The repair contract now derives the filesystem inventory recursively and reconciles it against 81 rendered Task 7 files in `app/customer/__tests__/sitewide-i18n.contract.test.ts`. Only the three named type-only files are excluded:

- `app/customer/activity/[id]/bodies/types.ts`
- `app/customer/activity/[id]/bodies/index.ts`
- `components/outlet/outlet-block-types.ts`

Tests are excluded by directory, while rendered layouts and profile helpers remain in the inventory. Thin data/delegating wrappers stay explicit and are identified separately. No Task 8 vendor implementation, Task 9 admin, infrastructure, auth, payment/API/database, login, or shared notification file is staged.

## TDD evidence

The new contract test was added before implementation. The initial exact run was RED:

```text
npx vitest run app/customer/__tests__/sitewide-i18n.contract.test.ts
Test Files 1 passed (1)
Tests 78 failed (78) / 4 passed (reported by Vitest as 78 tests, 74 failures)
```

After the minimal localization changes, the same exact command was GREEN:

```text
npx vitest run app/customer/__tests__/sitewide-i18n.contract.test.ts
Test Files 1 passed (1)
Tests 78 passed (78)
```

The repair strengthened the contract to compare the declared list with the actual rendered filesystem inventory, reject a translation hook whose bound function is never called, reject duplicated `common.` prefixes when the common namespace is already selected, and resolve representative semantic keys in all three locales. The repaired contract result is:

```text
npx vitest run app/customer/__tests__/sitewide-i18n.contract.test.ts
Test Files 1 passed (1)
Tests 82 passed (82)
```

The implementation uses the existing `useTranslation("customer")` client hook and `getServerTranslation("customer")` server helper. Fixed UI strings use locale keys; dynamic vendor/listing names, addresses, user messages, recommendation content, IDs, enum/API/database values, business rules, gates, mutations, actions, redirects, checkout/payment, wallet, KYC, and authorization behavior were preserved.

## Changed files and clusters

- Locale resources: `app/i18n/locales/en/customer.json`, `app/i18n/locales/zh-CN/customer.json`, `app/i18n/locales/ms/customer.json`.
- Contract/report: `app/customer/__tests__/sitewide-i18n.contract.test.ts`, this report.
- Customer routes staged in this focused index: activity detail/bodies, affiliate loading state, booking details, calendar loading state, cart voucher action, chat list/thread, home, map, profile preview, search, and wishlist client.
- Customer components staged in this focused index: activity reviews, affiliate chart, booking drawer/QR, chat panel, destination rail/modal, promotions, and profile phone/preferences editors.
- Guest catalogue; map views; discovery preview and Malaysia state/district maps; outlet block/page renderers.
- The deliberately untracked guest account empty state and capability helper, guest-route changes, checkout simulator, wallet/payout work, login, tests owned by other work, and notification infrastructure remain unstaged.

## Preservation and staging

The worktree contained pre-existing user changes for guest mode, payment simulator, wallet/payouts, maps, activity, vendor pages, admin, APIs, and related tests. Those changes were preserved in the working tree. Mixed customer files were staged hunk-by-hunk; a cart authentication line discovered in the index audit was unstaged without altering the worktree. The user-owned `app/login/page.tsx` signup hunk, guest-account-empty-state component, capability helper, and notification infrastructure remain out of scope. No worktree reset, revert, or broad reformat was used.

The repair also replaced semantically mismatched generic keys with dedicated activity, map, guest, chat, affiliate, calendar, outlet, search, review, and preference-editor keys in all three locale resources. Fixed UI in search, activity reviews, the destination rail, outlet block editor, and preference editor is translated; dynamic names, addresses, review text, IDs, and persisted values remain untouched. The two reviewed `en-MY` date renderings now use the existing locale-aware formatter.

## Verification

Passed:

```text
npx vitest run app/customer/__tests__/sitewide-i18n.contract.test.ts lib/i18n/__tests__/resources.test.ts   # 83/83
npx vitest run app/customer components/customer components/guest components/outlet lib/customer lib/i18n/__tests__/resources.test.ts   # 332/332
npx tsc --noEmit                                                        # pass
git diff --check 63cdfb4                                                # pass
```

The focused customer/component regression command was:

```text
npx vitest run app/customer components/customer components/guest components/outlet lib/customer lib/i18n/__tests__/resources.test.ts
```

It produced 332 passing tests out of 332. The earlier `app/customer/bookings/page.tsx` contract failure was resolved by the dedicated localized `backToCalendar` key. Targeted ESLint completed with 0 errors and warnings only (existing React effect/image/dependency warnings; the localization hook dependency warnings found during the pass were fixed).

## Blockers and commit status

The repair pass consumed the supplied `luna_worker` review findings. Per the repair instruction, this pass did not spawn additional subagents. The final index audit passed, the deliberately untracked user component remained unstaged, and no implementation blocker remains.
