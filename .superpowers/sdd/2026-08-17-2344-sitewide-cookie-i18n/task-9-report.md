# Task 9 report — governance workspaces

## Outcome

Localized the scoped admin, approver, wallet-approval, and super-admin interfaces with the existing cookie-backed `admin` and `common` namespaces. Existing action enums, role gates, API payloads, pagination rules, batch-action capabilities, and review workflows remain unchanged.

## Implementation

- Parallel inventory clusters produced manifests containing 516 route-A keys, 338 route-B keys, 209 component keys, and 222 withdrawal/refund keys.
- The manifests initially merged into 1,285 unique `admin` keys with no key conflicts. The focused review repair added formatter, chatbot-result, withdrawal-age, and enum labels, bringing all three resources to 1,364 aligned leaf keys.
- Added a scoped admin i18n contract covering all Task 9 pages and components.
- Updated source-contract tests to assert translation keys while retaining their API, pagination, evidence, and decision-flow assertions.
- Preserved pre-existing mixed work in `app/admin/withdrawals/page.tsx`, its contract test, and the untracked `app/admin/refunds/` feature; their localized working-tree versions were verified but intentionally excluded from the focused commit.

## Scope boundaries

- No dependencies added.
- No database or migration changes.
- No API, permission, action-set, or business-logic changes.
- `app/admin/layout.tsx` remains outside this task because Task 4 owns the localized shell and the current file contains unrelated worktree changes.

## Verification

- `npx vitest run app/admin/__tests__/sitewide-i18n.contract.test.ts lib/i18n/__tests__/resources.test.ts` — 14/14 passed.
- `npx vitest run app/admin components/admin` — 48/48 passed.
- Locale audit — 1,364/1,364 keys, zero missing/extra keys, zero interpolation-token mismatches; only documented technical terms and brands remain intentionally identical to English.
- Static Task 9 source-key audit — zero missing keys.
- `npx tsc --noEmit` — passed.
- `npx eslint app/admin components/admin components/shared/affiliate-qr-code.tsx components/shared/share-button.tsx` — zero errors; 45 pre-existing warnings remain.
