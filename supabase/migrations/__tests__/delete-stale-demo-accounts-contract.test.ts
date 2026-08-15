import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migrationPath = resolve(
  process.cwd(),
  "supabase/migrations/20260815120000_delete_stale_demo_accounts.sql",
);

describe("delete stale demo accounts migration", () => {
  it("deletes all 5 stale accounts from both users tables with pre/post assertions", () => {
    expect(existsSync(migrationPath)).toBe(true);
    const migration = readFileSync(migrationPath, "utf8");

    const staleIds = [
      "aaaaaaaa-0000-0000-0000-000000000009",
      "aaaaaaaa-0000-0000-0000-000000000010",
      "aaaaaaaa-0000-0000-0000-000000000011",
      "aaaaaaaa-0000-0000-0000-000000000012",
      "aaaaaaaa-0000-0000-0000-000000000013",
    ];
    for (const id of staleIds) expect(migration).toContain(id);

    expect(migration).toContain("DELETE FROM public.users WHERE id = ANY(stale_ids)");
    expect(migration).toContain("DELETE FROM auth.users WHERE id = ANY(stale_ids)");
    expect(migration).toContain("RAISE EXCEPTION");
    expect(migration).toContain("BEGIN;");
    expect(migration).toContain("COMMIT;");
    expect(migration).toContain("ALTER TABLE public.wallet_transactions DISABLE TRIGGER wallet_transactions_append_only;");
    expect(migration).toContain("ALTER TABLE public.wallet_transactions ENABLE TRIGGER wallet_transactions_append_only;");
  });
});
