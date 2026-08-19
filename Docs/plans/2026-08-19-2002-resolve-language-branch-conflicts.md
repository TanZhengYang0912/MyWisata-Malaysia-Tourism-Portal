# Resolve Language Branch Stash Conflicts

Status: approved for implementation by the user's 19 Aug 2026 request.

## Context

GitHub Desktop attempted to move the in-progress language, authentication, customer,
and payment work onto `feature/multiple-luanguage`. Its automatic stash restoration
left unmerged index entries labelled `Updated upstream` and `Stashed changes`.
There is no active `MERGE_HEAD`, so the immediate task is to resolve the restored
working changes without discarding either the current branch structure or the newer
language and customer fixes.

## Decisions

- Treat index stage 2 as the current `feature/multiple-luanguage` version and stage 3
  as the restored in-progress work.
- Preserve all added locale resources, locale tests, language controls, design/spec
  documents, and existing staged payment/auth/customer work.
- Merge overlapping components semantically: retain the current branch's newer route
  and data structure while applying the restored localization, validation, and guest
  behavior.
- Keep Calendar and Orders route entries as thin wrappers around the already-extracted
  shared views so `/customer/activity` does not regress into importing route modules.
- Do not discard, reset, or rewrite unrelated staged or unstaged user changes.

## Files to modify

- `package.json`: combine the non-overlapping script/dependency additions.
- `app/customer/activity/[id]/activity-detail-client.tsx`
- `app/customer/affiliate/page.tsx`
- `app/customer/bookings/[id]/page.tsx`
- `app/customer/calendar/page.tsx`
- `app/customer/chat/[threadId]/page.tsx`
- `app/customer/design-demo/design-demo-client.tsx`
- `app/customer/layout.tsx`
- `app/customer/orders/page.tsx`
- `app/customer/trip/[tripId]/trip-planner-client.tsx`
- `app/customer/vendor/[vendorId]/page.tsx`
- `app/customer/wishlist/page.tsx`
- `app/guest/layout.tsx`
- `app/login/page.tsx`
- `components/customer/booking-day-drawer.tsx`
- `components/demo-map/malaysia-state-map.tsx`
- `components/demo-map/story-map.tsx`
- `components/profile/profile-sections.tsx`
- `components/shared/notification-center.tsx`
- `components/shared/status-badge.tsx`
  - Resolve each conflict while preserving both current structure and restored i18n,
    auth, guest, validation, or map behavior.
- `Docs/plans/2026-08-17-1729-provider-simulator-payment-engineering.md`
- `Docs/superpowers/specs/2026-08-17-shared-customer-guest-experience-design.md`
- `app/customer/__tests__/sitewide-i18n.contract.test.ts`
- `app/vendor/__tests__/sitewide-i18n.contract.test.ts`
- `app/i18n/locales/{en,ms,zh-CN}/{common,customer}.json`
- `components/shared/language-switcher.tsx`
- `components/shared/__tests__/language-switcher.test.tsx`
- `lib/i18n/locale.ts`
- `lib/i18n/__tests__/locale.test.ts`
- `lib/supabase/__tests__/proxy-locale.test.ts`
  - Keep the restored files that do not exist on the current branch and stage them as
    additions.

## Scope boundaries

- Resolve only the existing stash/index conflicts and the already-requested
  `.gitignore` entry for local `output/` artifacts.
- Preserve all other staged files exactly as they are.
- Do not redesign UI, change authorization rules, alter database behavior, or add
  features during conflict resolution.

## Files not being touched

- Existing non-conflicted application/API files.
- Existing Supabase migrations and migration tests.
- Generated files under `.next`, `output`, or Playwright reports.

## Dependencies and database

- New dependencies: none; only reconcile already-present package changes.
- Database changes: none introduced by this resolution. Existing staged migrations
  remain untouched.

## Risks

- Choosing one side wholesale can regress role-aware login, default-English locale
  persistence, guest capability gates, or the Activity route-boundary fix.
- Locale JSON can remain syntactically valid while missing keys required by merged
  components.
- Because this is a stash-apply conflict rather than an active merge, committing it
  does not itself connect the source branch history; that history decision must be
  handled only after the worktree is clean.

## Verification

1. Ensure `git ls-files -u` and conflict-marker searches return no results.
2. Validate locale JSON and `package.json` parsing.
3. Run focused locale, login/auth, Activity route-boundary, map, profile, and shared
   component tests.
4. Run `npx tsc --noEmit`, `npm run lint`, and `git diff --check` once after the final
   change.
5. Perform one bounded independent read-only review before handoff.
