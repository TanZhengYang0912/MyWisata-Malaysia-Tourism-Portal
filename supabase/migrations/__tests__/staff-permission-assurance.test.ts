import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migrationsDirectory = resolve(process.cwd(), "supabase/migrations");

describe("staff permission assurance migration", () => {
  it("requires verified Passkey assurance before returning staff permissions", () => {
    const migrations = readdirSync(migrationsDirectory).filter((name) =>
      /_staff_permission_assurance\.sql$/.test(name),
    );

    expect(migrations).toHaveLength(1);
    const migration = readFileSync(resolve(migrationsDirectory, migrations[0]), "utf8");

    expect(migration).toContain("app_private.has_staff_permission(uuid, text)");
    expect(migration).toContain("staff_authority_assurance()");
    expect(migration).toContain("caller_lacks_aal2");
  });
});
