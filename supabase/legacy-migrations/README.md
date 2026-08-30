# Legacy local migrations

This directory preserves SQL files whose version was never recorded in the
linked production project's `supabase_migrations.schema_migrations` history.
They are retained as historical evidence only.

Supabase CLI migration discovery reads `supabase/migrations`, not this directory.
Do not copy these files back into the executable migration chain or mark their
versions as applied with `migration repair`. If a preserved behavior is still
required, compare it with the current production schema and implement the
smallest new timestamped forward migration.

Some migration contract tests read a preserved file as a **pre-baseline schema
contract**. That is allowed only when the corresponding table or RPC has been
confirmed in the linked production schema and no canonical migration owns its
original definition. Reading a file here never makes it executable. On
2026-08-30 the linked schema was checked directly for the Wallet split/report,
payout failure, recommendation evidence/read-state, notification snapshot, and
vendor-claim objects used by those contracts.
The exact per-file evidence and linked-schema query results are recorded in
`production-contract-verification.json`.

`manifest.json` is the exact 216-file inventory moved during the 2026-08-30
production-derived rebaseline. The corresponding 138-file production baseline
is recorded in `../canonical-migration-baseline.json`.
