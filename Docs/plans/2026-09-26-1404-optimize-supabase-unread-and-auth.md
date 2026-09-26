# Optimize Supabase unread counts and auth latency

Status: production migrations applied; application code deployment pending.

## Context

Supabase's 24-hour dashboard snapshot shows Disk I/O at 64%, 384 slow queries,
33/60 peak connections, and elevated Database and Realtime errors. Read-only
production statistics show high call counts for per-capability RPCs and
repeated unread-count reads. The current chat and support unread endpoints read
rows into Node.js and count them there. The customer notification bell loads its
feed and unread count sequentially while closed. A targeted support ticket
foreign-key index is absent and has scan evidence. These are concrete code and
query-path improvements; the screenshot alone does not establish that Next.js
rendering is the source of physical Disk I/O.

## Decisions

- Reduce repeated database round trips and move unread aggregation into narrow,
  caller-scoped Postgres functions.
- Batch the existing canonical capability resolver calls without changing its
  authorization decisions; retain the per-capability fallback for rollout and
  schema compatibility.
- Start `/api/auth/me` capability resolution only after validating the account
  role, then overlap it with the existing staff-access lookup.
- Reduce unnecessary closed-tab notification and support polling, and coalesce
  Realtime-triggered chat unread refreshes.
- Add only the evidenced `support_tickets(user_id)` index; do not apply a broad
  advisor-generated index or RLS sweep.
- Apply the eager image hint only to the observed above-the-fold LCP image and
  add Next.js's root scroll-behavior attribute.
- Apply the additive Supabase migrations to the confirmed FYP production project.
  Do not push to GitHub or deploy application code in this task.
- Do not change Supabase compute, Storage assets/CDN settings, existing RLS
  policies, or the unrelated `product_merge_map` RLS finding.

## Reuse Decisions

| Candidate | Exact path | Reusable behavior | Decision |
| --- | --- | --- | --- |
| Chat unread route | `app/api/chat/unread-count/route.ts` | Existing authenticated endpoint and response contract | Extend; move count query into RPC while preserving participant, mute, sender, and read exclusions |
| Canonical capabilities | `lib/auth/customer-capabilities.server.ts`, `lib/entitlements/server.ts` | Existing `resolve_user_capability` policy and generation-coherence fallback | Extend with batch transport; do not duplicate entitlement rules |
| Auth bootstrap | `app/api/auth/me/route.ts` | Existing independent account reads and response shape | Batch capability reads after role validation and overlap them with staff-access lookup |
| Notification bell | `components/shared/notification-bell.tsx`, `app/api/notifications/route.ts` | Existing page-size, totals, vendor pagination, feed and unread endpoint contracts | Extend polling behavior; preserve existing dirty vendor-pagination changes |
| Support unread semantics | `app/api/support/unread-count/route.ts`, `lib/support/unread.ts`, `lib/affiliate/admin-guard.ts` | Existing timestamp comparison and super-admin boundary | Aggregate in a caller-scoped RPC using the same rules |
| Customer polling | `app/customer/layout.tsx`, `components/providers/support-chat.tsx` | Existing polling and Realtime subscriptions | Gate background polling by visibility and debounce duplicate refreshes |
| LCP image and scroll behavior | `components/customer/promotion-campaign-spotlight.tsx`, `app/layout.tsx` | Existing `next/image` and root document | Add the observed LCP loading hint and root scroll attribute |
| Existing schema indexes | `supabase/migrations/` | Existing chat, notification, and reply indexes | Reuse; add only the missing support ticket owner index |

## Phases

1. **Plan and migration scaffold** — add this plan and create a Supabase CLI
   migration for the caller-scoped aggregate/batch RPCs and the targeted index.
2. **Database query paths** — implement batch capability resolution, chat and
   support unread aggregates, and `support_tickets(user_id)` index. RPCs must
   verify the authenticated caller and preserve existing authorization scope.
3. **Application integration** — use the batch/fallback capability transport,
   overlap `/api/auth/me` capability/staff reads, route unread endpoints through the aggregate
   RPCs, and reduce redundant notification/support/chat refreshes.
4. **Small rendering polish** — add the LCP loading hint and root scroll
   behavior attribute.
5. **Review and validation** — inspect the scoped diff; run lint and TypeScript
   checks if the current dirty workspace allows. Do not run tests in this task.

## Exact files in scope

- `Docs/plans/2026-09-26-1404-optimize-supabase-unread-and-auth.md`
- New Supabase CLI migration under `supabase/migrations/`
- `supabase/migrations/__tests__/canonical-history.test.ts` — update only its
  approved migration-history inventory for the new migration
- `lib/entitlements/server.ts`
- `lib/auth/customer-capabilities.server.ts`
- `app/api/auth/me/route.ts`
- `app/api/chat/unread-count/route.ts`
- `app/api/support/unread-count/route.ts`
- `components/shared/notification-bell.tsx`
- `components/providers/support-chat.tsx`
- `app/customer/layout.tsx`
- `components/customer/promotion-campaign-spotlight.tsx`
- `app/layout.tsx`

## Scope boundaries

- No broad refactor, component redesign, dependency addition, or API response
  contract change.
- No edit to unrelated changes already present in the worktree. In particular,
  preserve the current notification-bell vendor pagination, customer-layout
  text wrapping, globals stylesheet changes, and migration-history edits.
- No automatic RLS change for `public.product_merge_map`; its policies require
  an explicit access design.
- No Git push or application deployment.

## Files not being touched

- `next.config.ts` and Storage object data: the image timeout was not reproduced
  by a direct object request, and existing image optimization is configured.
- Existing RLS policies and unrelated schema/indexes.
- Package manifests and lockfiles; use the Supabase CLI ephemerally if needed.
- Any route, component, or layout outside the exact scope above.

## Dependencies and database changes

- No runtime or development dependency is intended.
- The migrations add caller-checked, authenticated-only RPCs that compose
  existing entitlement logic and unread rules, plus an ordinary index on
  `support_tickets(user_id)` for the verified owner filter.
- The migration is applied to the production database. App-side improvements
  take effect after the corresponding Next.js code is deployed.

## Risks

- Incorrect caller scope in an aggregate RPC could expose unread counts across
  accounts; explicitly bind every function to `auth.uid()` and preserve current
  role/participant rules.
- Capability batching must retain generation coherence and the existing
  single-capability fallback during migration rollout.
- Visibility gating and debounce must refresh promptly when a tab becomes
  active and must not suppress explicit user refreshes.
- Disk I/O metrics are database-wide and include other workloads; local code
  improvements cannot guarantee a specific production percentage reduction.

## Verification

- Review the exact diff and migration SQL; inspect status to confirm unrelated
  worktree changes remain intact.
- Run focused lint and `npx tsc --noEmit` if feasible; no automated tests are
  added or run in this task.
- Do not claim production impact until the migration and application are
  deployed and comparable Supabase metrics are observed.

## Local verification result

- Focused ESLint passed for every modified TypeScript/TSX implementation file.
- `npx tsc --noEmit` passed.
- Automated tests and a production build were not run. A build was skipped to
  avoid overwriting the shared Next.js development output.
- Supabase recorded migrations `20260926062706` and `20260926063036`; readback
  confirmed all three RPCs are invoker functions executable by `authenticated`
  but not `anon`, and confirmed the support ticket index.
- The performance advisor's unindexed foreign-key finding count moved from 174
  to 173 after adding the support ticket owner index. The security advisor no
  longer reports the two unread RPCs; its existing `product_merge_map` RLS error
  remains unrelated and unmodified.
- The migration's performance effect is not yet measurable because the app
  code still needs to be deployed.
