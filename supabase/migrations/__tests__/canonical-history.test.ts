import { existsSync, readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migrationsDirectory = resolve(process.cwd(), "supabase/migrations");
const baselinePath = resolve(process.cwd(), "supabase/canonical-migration-baseline.json");
const approvedForwardMigrations = [
  "20260830133000_disable_production_demo_purchase.sql",
  "20260830134000_chat_auto_archive.sql",
];

function migrationFiles() {
  return readdirSync(migrationsDirectory).filter((filename) => filename.endsWith(".sql")).sort();
}

describe("canonical production migration history", () => {
  it("contains one SQL file per migration version", () => {
    const versions = migrationFiles().map((filename) => filename.split("_", 1)[0]);
    expect(new Set(versions).size).toBe(versions.length);
  });

  it("records the exact linked-production baseline", () => {
    expect(existsSync(baselinePath)).toBe(true);
    if (!existsSync(baselinePath)) return;

    const baseline = JSON.parse(readFileSync(baselinePath, "utf8")) as { migrations: string[] };
    expect(baseline.migrations).toHaveLength(138);
    expect(migrationFiles()).toEqual([...baseline.migrations, ...approvedForwardMigrations].sort());
  });

  it("never deploys the Demo Purchase RPC through production migrations", () => {
    const productionSql = migrationFiles()
      .map((filename) => readFileSync(resolve(migrationsDirectory, filename), "utf8"))
      .join("\n");

    expect(productionSql).not.toMatch(/CREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION\s+public\.create_demo_purchase/i);
  });
});
