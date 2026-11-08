import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migrationsDirectory = resolve(process.cwd(), "supabase/migrations");

function migration(slug: string): string {
  const matches = readdirSync(migrationsDirectory).filter((file) => file.endsWith(`_${slug}.sql`));
  expect(matches, `expected one migration for ${slug}`).toHaveLength(1);
  return readFileSync(resolve(migrationsDirectory, matches[0]), "utf8");
}

describe("wallet split checkout RPC boundary migration", () => {
  it("preserves checkout ownership and wallet reservation behavior behind an invoker wrapper", () => {
    const sql = migration("private_reserve_wallet_split_checkout");

    expect(sql).toContain("ALTER FUNCTION public.reserve_wallet_split_checkout(uuid) SET SCHEMA app_private");
    expect(sql).toMatch(/CREATE OR REPLACE FUNCTION public\.reserve_wallet_split_checkout\([\s\S]*?p_checkout_session_id uuid\s*\)[\s\S]*?RETURNS jsonb[\s\S]*?LANGUAGE sql[\s\S]*?VOLATILE[\s\S]*?SECURITY INVOKER/i);
    expect(sql).toContain("SELECT app_private.reserve_wallet_split_checkout(p_checkout_session_id)");
    expect(sql).toContain("GRANT EXECUTE ON FUNCTION app_private.reserve_wallet_split_checkout(uuid) TO authenticated, service_role");
    expect(sql).toContain("REVOKE ALL ON FUNCTION public.reserve_wallet_split_checkout(uuid) FROM PUBLIC, anon, service_role");
    expect(sql).toContain("GRANT EXECUTE ON FUNCTION public.reserve_wallet_split_checkout(uuid) TO authenticated, service_role");
    expect(sql).toContain("NOTIFY pgrst, 'reload schema'");
  });

  it("restricts the private reservation function to wallet-backed methods", () => {
    const sql = migration("harden_wallet_split_checkout_method");

    expect(sql).toContain("app_private.reserve_wallet_split_checkout(uuid)");
    expect(sql).toContain("v_definition := replace(v_definition, E'\\r\\n', E'\\n')");
    expect(sql).toContain("v_session.payment_method NOT IN ('wallet', 'wallet_split')");
    expect(sql).toContain("invalid_wallet_checkout_method");
    expect(sql).toContain("RAISE EXCEPTION 'wallet reservation definition changed; inspect migration before applying'");
  });
});
