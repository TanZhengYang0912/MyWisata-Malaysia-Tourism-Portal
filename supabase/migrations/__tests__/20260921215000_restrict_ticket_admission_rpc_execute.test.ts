import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20260921215000_restrict_ticket_admission_rpc_execute.sql"),
  "utf8",
);

describe("ticket admission RPC execute grants", () => {
  it("restricts the atomic pass mutation to the trusted service role", () => {
    expect(migration).toMatch(/REVOKE EXECUTE ON FUNCTION public\.admit_ticket_pass\(uuid,\s*uuid,\s*uuid,\s*uuid,\s*integer,\s*text,\s*jsonb\)\s+FROM PUBLIC, anon, authenticated/i);
    expect(migration).toMatch(/GRANT EXECUTE ON FUNCTION public\.admit_ticket_pass\(uuid,\s*uuid,\s*uuid,\s*uuid,\s*integer,\s*text,\s*jsonb\)\s+TO service_role/i);
  });
});
