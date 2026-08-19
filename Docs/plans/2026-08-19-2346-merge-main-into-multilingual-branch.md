# Merge Main into Multilingual Branch

Status: completed on 20 Aug 2026; awaiting merge commit and push.

## Context

PR #15 proposes merging `feature/multiple-luanguage` into `main`, but GitHub reports
the branches as conflicting. Both branches descend from `68e637a`: `main` has 36
commits and the feature branch has 31 commits after that common ancestor. The overlap
is broad because both lines changed Admin, Customer, Vendor, authentication, checkout,
and shared UI code.

## Decisions

- Merge `origin/main` into `feature/multiple-luanguage` once; do not rebase 31 commits.
- Create a recoverable backup ref before starting the merge.
- Resolve each conflict semantically, preserving both the latest `main` behavior and
  the feature branch's cookie-based English/Bahasa Melayu/Simplified Chinese support.
- Preserve authentication, customer capability gates, payment idempotency, payout
  safety, Activity route boundaries, and Vendor UI behavior.
- Do not choose all conflicts from one side and do not redesign unrelated UI.
- Commit and push the completed merge so PR #15 updates automatically.

## Files to modify

Git will merge non-conflicting `main` changes unchanged. Manual conflict resolution is
limited to these exact files:

- `app/admin/affiliate/page.tsx`
- `app/admin/ai-assistant/page.tsx`
- `app/admin/catalogue/page.tsx`
- `app/admin/chat-reports/page.tsx`
- `app/admin/chatbot/page.tsx`
- `app/admin/kyc/page.tsx`
- `app/admin/layout.tsx`
- `app/admin/recommendations/page.tsx`
- `app/admin/support/page.tsx`
- `app/admin/users/page.tsx`
- `app/admin/withdrawals/page.tsx`
- `app/api/checkout/prepare/route.ts`
- `app/customer/activity/[id]/activity-detail-client.tsx`
- `app/customer/affiliate/page.tsx`
- `app/customer/cart/page.tsx`
- `app/customer/chat/[threadId]/page.tsx`
- `app/customer/chat/page.tsx`
- `app/customer/checkout/page.tsx`
- `app/customer/customer-home-client.tsx`
- `app/customer/experience/[experienceId]/experience-booking-sidebar.tsx`
- `app/customer/explore/explore-client.tsx`
- `app/customer/for-you/for-you-client.tsx`
- `app/customer/layout.tsx`
- `app/customer/orders/page.tsx`
- `app/customer/place/[slug]/page.tsx`
- `app/customer/profile/page.tsx`
- `app/customer/search/search-client.tsx`
- `app/customer/support/[id]/page.tsx`
- `app/customer/trip/[tripId]/trip-planner-client.tsx`
- `app/customer/trip/trip-hub-client.tsx`
- `app/customer/vendor/[vendorId]/__tests__/page.contract.test.ts`
- `app/customer/vendor/[vendorId]/page.tsx`
- `app/customer/wallet/page.tsx`
- `app/customer/wallet/withdrawals/[id]/page.tsx`
- `app/layout.tsx`
- `app/login/page.tsx`
- `app/vendor/inbox/page.tsx`
- `app/vendor/outlets/page.tsx`
- `app/vendor/products/page.tsx`
- `app/vendor/vouchers/page.tsx`
- `components/admin/ai-draft-email-modal.tsx`
- `components/admin/moderation-flags-panel.tsx`
- `components/admin/user-management-drawer.tsx`
- `components/customer/destination-preview-modal.tsx`
- `components/customer/nearby-outlets.tsx`
- `components/customer/outlet-chat-button.tsx`
- `components/customer/place-card.tsx`
- `components/customer/place-list.tsx`
- `components/customer/saved-destination-card.tsx`
- `components/demo-map/__tests__/malaysia-state-map.test.ts`
- `components/demo-map/malaysia-state-map.tsx`
- `components/demo-map/story-map.tsx`
- `components/layout/vendor-sidebar.tsx`
- `components/outlet/outlet-block-renderer.tsx`
- `components/outlet/outlet-menu.tsx`
- `components/outlet/outlet-page-renderer.tsx`
- `components/profile/profile-sections.tsx`
- `components/providers/auth.tsx`
- `components/providers/trip.tsx`
- `components/shared/affiliate-funnel.tsx`
- `components/shared/affiliate-insight-card.tsx`
- `components/shared/affiliate-rank-card.tsx`
- `components/shared/chatbot-widget.tsx`
- `components/shared/fraud-breakdown-charts.tsx`
- `components/shared/notification-bell.tsx`
- `components/shared/share-button.tsx`
- `components/shared/status-badge.tsx`
- `components/shared/ticket-thread.tsx`
- `components/vendor/compact-filter-bar.tsx`
- `components/vendor/outlet-builder-canvas.tsx`
- `components/vendor/outlet-builder-inspector.tsx`
- `components/vendor/product-details-page.tsx`
- `components/vendor/product-form.tsx`
- `components/vendor/product-media-uploader.tsx`
- `components/vendor/voucher-form.tsx`
- `lib/checkout/__tests__/idempotency.test.ts`
- `lib/customer/header-navigation.ts`
- `package-lock.json`
- `package.json`
- `app/i18n/locales/en/customer.json`
- `app/i18n/locales/ms/customer.json`
- `app/i18n/locales/zh-CN/customer.json`
- `app/i18n/locales/en/auth.json`
- `app/i18n/locales/ms/auth.json`
- `app/i18n/locales/zh-CN/auth.json`
- `Docs/plans/2026-08-19-2346-merge-main-into-multilingual-branch.md`

## Scope boundaries

- Resolve the existing PR conflict only.
- Preserve both branches' already-approved behavior; do not add new features.
- Do not alter production data, Supabase configuration, secrets, or remote database
  state.
- Do not force-push or rewrite branch history.

## Files not being manually touched

- `supabase/migrations/**`
- `.env*`
- Generated `.next`, coverage, Playwright, and `output` artifacts.
- Any non-conflicting application file, except when a confirmed compile/test failure
  proves a minimal merge integration correction is required.

## Dependencies and database

- New dependencies: none. `package.json` and `package-lock.json` will reconcile only
  dependencies already present on either branch.
- Database changes: none introduced. Existing migrations from `main` are accepted
  unchanged by Git.

## Risks

- Choosing one side wholesale can remove locale keys or regress current business logic.
- Auth conflicts can reintroduce cross-role redirects or unhandled account-switch errors.
- Checkout/wallet conflicts can weaken idempotency, KYC gates, or payout safety.
- Customer route conflicts can reintroduce the Activity rendering loop.
- Locale dictionaries may parse but lack runtime keys required by merged components.

## Phases

1. Create a safety backup ref and merge `origin/main` without committing.
2. Resolve package/test and low-risk UI conflicts by preserving both intents.
3. Resolve auth/payment conflicts using an independent read-only risk review.
4. Verify no unmerged entries or conflict markers remain.
5. Run focused conflict-area tests, i18n verification, TypeScript, full tests, lint,
   and diff checks once after the final change.
6. Commit the merge, push `feature/multiple-luanguage`, and confirm PR #15 is no
   longer conflicting.

## Verification

- `git ls-files -u` returns no entries.
- Conflict-marker scan returns no source markers.
- `npm run verify:i18n` passes.
- `npx tsc --noEmit` passes.
- Affected auth, checkout, customer, Admin, Vendor, and i18n tests pass.
- `npm test` passes.
- `npm run lint` has no errors.
- `git diff --check` passes before commit.
- GitHub reports PR #15 mergeable after push.

## Verification results

- All 79 conflicted files were resolved; `git ls-files -u` is empty.
- Conflict-marker scan and `git diff --check` passed.
- `npm run verify:i18n` passed.
- `npx tsc --noEmit` passed.
- `npm test` passed: 917 suites, 1,823 tests, 0 failures.
- `npm run lint` completed with 0 errors; pre-existing warnings remain.
- A bounded checkout/wallet security review confirmed account-safe async wallet writes
  and verified failed Stripe preparation is compensated or quarantined from reuse.
