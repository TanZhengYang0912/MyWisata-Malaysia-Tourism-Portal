# Assignment Capability Eligibility Fix

**Status:** Complete on 2026-09-10.

**Goal:** Make the targeted Assignment Capability selector reflect the governed capability catalogue so an Admin cannot attempt an invalid manual allow from misleading UI.

## Reuse Decisions

- **Reuse:** `GET /api/admin/access-control/capabilities?page=1&pageSize=100` and the existing `PageResult<CapabilityRecord>` contract for authoritative metadata.
- **Reuse:** `CapabilityRecord`, existing Access Control form controls, confirmation dialog, error handling, and three-locale Admin resources.
- **Extend:** `AssignmentsTab` loading and selection state; do not create another endpoint or capability list.
- **Reject:** the current hard-coded `CAPABILITIES` array because it cannot reflect `enabled` or `manuallyAssignable` changes.
- **Reject:** removing database validation because UI restrictions are guidance, not an authorization boundary.

## Implementation Plan

- Modify `components/admin/access-control/assignments-tab.tsx`: load the capability catalogue, disable globally disabled options, disable non-manually-assignable options for `Allow`, retain enabled options for emergency `Deny`, and prevent review when the selected option is unavailable.
- Add `components/admin/access-control/__tests__/assignments-tab.test.tsx`: reproduce the misleading selectable options, then verify effect-aware eligibility and catalogue loading.
- Modify `app/i18n/locales/{en,ms,zh-CN}/admin.json`: add the option-state and helper text.
- Scope boundary: no API, RPC, database, policy, Staff Role, Capability editor, or audit behavior changes.
- New dependencies: none.
- Database changes: none.
- Risks: stale or unavailable catalogue data must fail closed; `Deny` must remain available for enabled system-managed capabilities; changing the effect must not leave an invalid submission enabled.

## Verification

- Focused UI test was observed failing before implementation and passes with three eligibility, fail-closed, and request-ordering cases.
- Access Control UI/API tests passed: 10 files and 147 tests.
- Full Vitest suite passed: 623 files and 2,984 tests, with 7 files and 20 tests skipped by the existing suite.
- TypeScript passed with `npx tsc --noEmit`.
- ESLint passed with 0 errors and 67 pre-existing warnings outside the changed files.
- i18n coverage and default-value checks passed; English, Simplified Chinese, and Malay remain at 100%.
- Browser verification confirmed system-managed capabilities are unavailable for `Allow`, available for `Deny`, and the page emits no console errors.
- The bounded permission/privacy review found no sensitive-data exposure and confirmed the UI rules match database enforcement.
