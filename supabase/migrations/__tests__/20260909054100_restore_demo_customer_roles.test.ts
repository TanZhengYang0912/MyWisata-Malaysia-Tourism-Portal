import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migrationPath = resolve(
  process.cwd(),
  "supabase/migrations/20260909054100_restore_demo_customer_roles.sql",
);

describe("restore demo customer roles migration", () => {
  it("repairs only the four canonical customer demo identities idempotently", () => {
    expect(existsSync(migrationPath)).toBe(true);
    if (!existsSync(migrationPath)) return;

    const migration = readFileSync(migrationPath, "utf8");
    expect(migration).toContain("aaaaaaaa-0000-0000-0000-000000000005");
    expect(migration).toContain("customer1@demo.local");
    expect(migration).toContain("aaaaaaaa-0000-0000-0000-000000000006");
    expect(migration).toContain("customer2@demo.local");
    expect(migration).toContain("aaaaaaaa-0000-0000-0000-000000000007");
    expect(migration).toContain("customer3@demo.local");
    expect(migration).toContain("aaaaaaaa-0000-0000-0000-000000000008");
    expect(migration).toContain("customer4@demo.local");
    expect(migration).toContain("role_row.name = 'customer'");
    expect(migration).toContain("NOT EXISTS");
    expect(migration).toContain("existing_assignment.user_id = user_row.id");
    expect(migration).toContain("ON CONFLICT DO NOTHING");
    expect(migration).not.toContain("LIKE '%@demo.local'");
  });
});
