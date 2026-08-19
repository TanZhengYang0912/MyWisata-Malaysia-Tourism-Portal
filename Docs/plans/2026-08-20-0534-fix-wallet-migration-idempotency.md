# Fix wallet migration idempotency

Status: Complete

## Context

Migration `098_provider_neutral_withdrawal_completion.sql` fails when the target database already contains the provider-aware terminal-withdrawal constraint. The existing remote definition matches the migration, so the migration must safely replace the named constraint.

## Decisions and scope

- Rebuild only `wr_terminal_has_provider_reference` using `DROP CONSTRAINT IF EXISTS` followed by the existing `ADD CONSTRAINT` definition.
- Add a contract assertion that protects repeat execution.
- Do not change application code, other migrations, data, or unrelated schema objects.
- Add no dependencies.

## Files to modify

- `supabase/migrations/098_provider_neutral_withdrawal_completion.sql`
  - Make the named terminal-withdrawal constraint repeatable.
- `supabase/migrations/__tests__/098_provider_neutral_withdrawal_completion.test.ts`
  - Assert that both the legacy and current constraint names are safely removed before rebuilding.

## Database change

The migration temporarily drops and immediately recreates `wr_terminal_has_provider_reference` with the same checked expression. No rows are deleted or rewritten.

## Risks

- Existing rows must satisfy the current constraint when it is recreated. The remote database already has the same constraint definition, so current rows already satisfy it.
- If any later statement fails, execution stops and the migration is not recorded as applied.

## Verification

- Run the migration contract test.
- Run `git diff --check` and `npx tsc --noEmit`.
- Re-run migration `098`, then verify its remote history entry before continuing later migrations.
