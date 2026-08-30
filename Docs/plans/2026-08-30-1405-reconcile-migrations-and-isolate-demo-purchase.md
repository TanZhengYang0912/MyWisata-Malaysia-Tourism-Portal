# Reconcile Migration History and Isolate Demo Purchase

**Status:** Completed and deployed to the linked project

## Context

The linked production project has 138 unique, lint-clean migration versions. The
repository currently has 250 SQL files across 231 versions, including 15 duplicate
version families. Only 34 local versions match production; 216 local SQL files
across 197 versions were never recorded in the linked production history, while
104 production versions are absent locally. This prevents a trustworthy
`supabase db push --dry-run` and makes a fresh local rebuild differ from production.

The local-only `create_demo_purchase` RPC is a development shortcut that creates a
paid, fulfilled order without a payment record, then invokes Affiliate attribution
and Vendor notifications. Production does not contain the RPC, but the deployed
application route has no production-environment guard and the linked
`platform_settings.demo.mode` value is currently `true`. The same development
surface also contains `force-clear`, which can clear every pending Affiliate
commission without its normal hold period.

## Decisions

- Treat the 138 migration files fetched from the linked project as the deployed
  canonical baseline. Keep the 34 matching local files to avoid non-semantic
  whitespace churn and add the 104 missing canonical files exactly as fetched.
- Move all 216 local-only SQL files out of `supabase/migrations/` into
  `supabase/legacy-migrations/`; preserve them as historical evidence but never
  execute them through normal Supabase migration discovery.
- Keep `create_demo_purchase` only as an explicitly installed local/staging test
  helper under `supabase/test-support/`. It must never return to production
  migrations.
- Add an application environment allowlist so both Demo Purchase and force-clear
  return 404 before authentication or database initialization in production.
  Force-clear additionally requires Admin/Approver in allowed non-production
  environments.
- Add a forward migration that disables `demo.mode` by default and removes any
  accidentally installed Demo Purchase RPC. Staging must opt in explicitly after
  canonical migrations and install the helper separately.
- Restore `archive_inactive_chats` as a production service-role-only RPC through a
  new forward migration and register its existing authenticated cron route.
- Never use bulk `migration repair` and never edit a migration already recorded
  online. After local reconciliation, apply only the new forward migrations.
- Remap migration contract tests to the remote-canonical files that actually own
  each behavior. If an expected behavior is absent from the canonical baseline,
  verify the linked production schema directly. A confirmed object that predates
  the recorded baseline may keep a read-only legacy contract; genuinely missing
  production behavior requires a forward migration rather than a weakened test.

## Exact files and functions/components

### Demo isolation

- Create `lib/demo/runtime.ts`
  - `isDemoToolRuntimeEnabled()`
- Create `lib/demo/__tests__/runtime.test.ts`
- Modify `app/api/dev/simulate-purchase/route.ts`
  - production/non-opted-in fail-closed gate before Supabase initialization
- Modify `app/api/dev/force-clear/route.ts`
  - same environment gate plus `isSuperAdminOrApprover()` authorization
- Modify `app/dev/page.tsx`
  - hide the Demo Purchase UI unless the server-approved environment exposes it
- Create `app/dev/demo-purchase-client.tsx`
  - preserve the existing client UI after the server page becomes the guard
- Modify `app/api/dev/__tests__/simulate-purchase-atomicity.test.ts`
  - read the non-production helper instead of a production migration
- Create `app/api/dev/__tests__/production-isolation.test.ts`
- Create `app/api/dev/__tests__/force-clear-authorization.test.ts`
- Create `supabase/test-support/demo-purchase.sql`
- Create `supabase/test-support/README.md`
- Modify `Docs/adr/019-onorderpaid-contract-and-idempotency.md`
  - use the current real checkout attribution route as the production reference

### Canonical migration history

- Add the 104 exact SQL files present in
  `/var/folders/2k/9gm24jc16p513yff3zkk7lmw0000gn/T/tmp.XFnMbvz4G2/supabase/migrations/`
  whose version is absent from the repository.
- Move the 216 exact local SQL files whose version is absent from that fetched
  directory from `supabase/migrations/` to `supabase/legacy-migrations/`.
- Create `supabase/legacy-migrations/README.md` and
  `supabase/legacy-migrations/manifest.json`; the manifest is the exact filename
  inventory for all 216 moved files and records the production baseline used.
- Create `supabase/legacy-migrations/production-contract-verification.json` to
  record the per-file pg_catalog/data evidence for every pre-baseline contract
  still read by tests.
- Create `supabase/canonical-migration-baseline.json`; this is the exact inventory
  of the 138 fetched production versions and their filenames.
- Create `supabase/migrations/__tests__/canonical-history.test.ts`
  - unique version enforcement
  - exact canonical baseline coverage plus allowed pending forward migrations
  - Demo Purchase absence from production migrations
- Create `supabase/migrations/20260830133000_disable_production_demo_purchase.sql`
- Create `supabase/migrations/__tests__/20260830133000_disable_production_demo_purchase.test.ts`
- Create `supabase/migrations/20260830134000_chat_auto_archive.sql`
- Create `supabase/migrations/__tests__/20260830134000_chat_auto_archive.test.ts`
- Create `app/api/cron/archive-chats/__tests__/route.test.ts`
- Modify `vercel.json` to register `/api/cron/archive-chats`.

### Canonical contract remapping

Modify these existing tests to read the canonical migration(s) that contain the
same final behavior, or a new forward migration if the behavior is genuinely
absent:

- `supabase/migrations/__tests__/082_phone_verification_checkout_guards.test.ts`
- `supabase/migrations/__tests__/083_vendor_recommendation_claim_onboarding.test.ts`
- `supabase/migrations/__tests__/084_payout_destinations.test.ts`
- `supabase/migrations/__tests__/085_withdrawal_approver_notifications.test.ts`
- `supabase/migrations/__tests__/086_payout_report_details.test.ts`
- `supabase/migrations/__tests__/087_industry_payout_destinations.test.ts`
- `supabase/migrations/__tests__/088_withdrawal_review_sources.test.ts`
- `supabase/migrations/__tests__/089_payout_report_pending_amounts.test.ts`
- `supabase/migrations/__tests__/090_payout_failure_details.test.ts`
- `supabase/migrations/__tests__/092_recommendation_evidence_and_reward_reversals.test.ts`
- `supabase/migrations/__tests__/093_admin_recommendation_read_state.test.ts`
- `supabase/migrations/__tests__/095_recommendation_guided_vendor_claim.test.ts`
- `supabase/migrations/__tests__/20260829203000_progressive_verification_db_guards.test.ts`

The full-suite pass also discovered stale references outside the original 13;
these exact existing contracts are remapped as part of the same rebaseline:

- `app/__tests__/auth-lifecycle-i18n.contract.test.ts`
- `app/api/saved-destinations/__tests__/route-contract.test.ts`
- `lib/recommendations/__tests__/multivendor-migration-contract.test.ts`
- `lib/user-management/__tests__/account-moderation-rpc.test.ts`
- `lib/user-management/__tests__/rpc-contract.test.ts`
- `lib/wallet/__tests__/governance-migration-contract.test.ts`
- `supabase/migrations/__tests__/077_wallet_governance_report_contract.test.ts`
- `supabase/migrations/__tests__/078_connect_status_permissions.test.ts`
- `supabase/migrations/__tests__/079_wallet_hold_resume_notifications.test.ts`
- `supabase/migrations/__tests__/080_vendor_notifications.test.ts`
- `supabase/migrations/__tests__/081_vendor_email_event_types.test.ts`
- `supabase/migrations/__tests__/094_recommendation_approval_email.test.ts`
- `supabase/migrations/__tests__/20260731224343_canonical_discovery_categories.test.ts`
- `supabase/migrations/__tests__/20260805010000_mark_public_walks_free.test.ts`
- `supabase/migrations/__tests__/20260816130000_repair_booking_catalogue.test.ts`
- `supabase/migrations/__tests__/20260817090000_seed_federal_territories.test.ts`
- `supabase/migrations/__tests__/20260817094000_seed_vendor_images.test.ts`
- `supabase/migrations/__tests__/20260817110000_seed_federal_territory_place_images.test.ts`
- `supabase/migrations/__tests__/20260821150000_recommendation_geography_localization.test.ts`
- `supabase/migrations/__tests__/catalogue-voucher-dataset-contract.test.ts`
- `supabase/migrations/__tests__/chat-message-deliveries-contract.test.ts`
- `supabase/migrations/__tests__/chat-thread-uniqueness-contract.test.ts`
- `supabase/migrations/__tests__/customer-voucher-claim-visibility-contract.test.ts`
- `supabase/migrations/__tests__/customer-voucher-claims-contract.test.ts`
- `supabase/migrations/__tests__/delete-stale-demo-accounts-contract.test.ts`
- `supabase/migrations/__tests__/outlet-voucher-canonicalization.test.ts`
- `supabase/migrations/__tests__/remaining-outlet-manager-accounts-contract.test.ts`
- `supabase/migrations/__tests__/voucher-catalogue-deduplication.test.ts`
- `supabase/migrations/__tests__/voucher-catalogue-scope-contract.test.ts`

## Scope boundaries

- Preserve every production table, row, RLS policy, capability rule, Profile,
  Phone, KYC, wallet, Affiliate, Vendor, Booking, Checkout, and notification state.
- Do not reset the linked project and do not alter production migration-history
  records.
- Do not restore `create_demo_purchase` to production.
- Do not change `onOrderPaid`, real Affiliate attribution, real commission
  clearing, Vendor notification behavior, payment-provider settlement, refund,
  inventory, voucher, or booking logic.
- Do not modify unrelated dirty-worktree UI/Profile/city files.
- Do not delete legacy SQL evidence; move it outside executable discovery.

## Files not being touched

- `app/api/checkout/**` and `app/customer/checkout/**`
- `lib/affiliate/attribution.ts`, `lib/affiliate/clearing.ts`, and wallet accounting
- Vendor notification implementation under `lib/vendor-notifications/**`
- Profile, Phone, KYC, Entitlement UI/API implementations
- GeoNames importer and location UI
- Catalogue Review and Wallet Settings UI

## New dependencies

None.

## Database changes

- Forward-disable `platform_settings.demo.mode` and drop any accidentally installed
  `create_demo_purchase(UUID, UUID, UUID)` function.
- Add `archive_inactive_chats(INT)` with service-role-only execution. It updates
  only stale open chat-thread status/`archived_at`; it does not delete messages.
- Apply only these two forward migrations after a linked dry run proves no other
  migration is pending.

## Risks

- A filename-only rebaseline could hide a semantic mismatch. Mitigation: the 34
  common versions were already token-compared, the 104 missing files are copied
  from `supabase migration fetch`, and a clean rebuild plus linked dry run is
  required.
- Old tests may accidentally assert superseded SQL text. Mitigation: map each
  contract to the canonical final owner and preserve the same business assertion.
- Demo environment configuration could be mis-set. Mitigation: explicit opt-in,
  production hard stop before auth/DB work, database default false, and absence of
  the RPC in production migrations.
- Registering Chat archive cron activates a previously dormant maintenance path.
  Mitigation: service-role-only RPC, CRON secret guard already present, status-only
  update, focused test, and no message deletion.
- The worktree is already dirty. Every bulk operation must be version-set based,
  preserve matching/uncommitted canonical files, and avoid unrelated paths.

## Phases

1. Add failing Demo isolation, force-clear authorization, canonical uniqueness,
   and forward-migration contract tests.
2. Implement Demo runtime isolation and move its RPC to explicit test support.
3. Reconcile the executable migration directory to the fetched production
   baseline and create exact manifests.
4. Remap stale migration contract tests without weakening assertions, using the
   canonical owner where present and read-only pre-baseline evidence only for
   objects independently confirmed in the linked production schema.
5. Add the two forward migrations and Chat cron registration.
6. Run focused tests, all migration tests, TypeScript, i18n as affected, ESLint,
   full Vitest once, SQL parser/lint, and `supabase db push --linked --dry-run`.
7. Apply only the two reviewed forward migrations, verify remote settings/RPC ACL,
   migration status, and run one final bounded permission review.

## Verification

- TDD red/green evidence for Demo runtime isolation and canonical uniqueness.
- `npx vitest run` for affected tests during implementation.
- `npx vitest run supabase/migrations/__tests__` after canonical remapping.
- `npx tsc --noEmit`.
- Focused ESLint on modified TypeScript/TSX files.
- `npm run verify:i18n` only if user-visible text changes.
- `npm test` once after the final code change.
- `npx supabase db lint --linked --schema public --level error --fail-on error`.
- `npx supabase db push --linked --dry-run`; expected output contains only the two
  new forward migrations before deployment and none afterward.
- Read-only remote checks for `demo.mode=false`, missing `create_demo_purchase`,
  service-role-only `archive_inactive_chats`, and zero database lint errors.
- `git diff --check` and a scoped diff review before commit.
