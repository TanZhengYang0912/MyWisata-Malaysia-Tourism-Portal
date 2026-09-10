import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migrationPath = resolve(process.cwd(), "supabase/migrations/20260911100000_chat_message_context.sql");
const sql = existsSync(migrationPath) ? readFileSync(migrationPath, "utf8") : "";

describe("chat message context migration", () => {
  it("adds context_order_id with an FK to orders and context_snapshot jsonb", () => {
    expect(sql).toContain("ALTER TABLE public.chat_messages");
    expect(sql).toMatch(/context_order_id\s+UUID\s+REFERENCES\s+public\.orders\(id\)\s+ON DELETE SET NULL/i);
    expect(sql).toMatch(/context_snapshot\s+JSONB/i);
  });

  it("is additive only — no data movement, no dropped columns", () => {
    expect(sql).not.toMatch(/DROP\s+COLUMN/i);
    expect(sql).not.toMatch(/UPDATE\s+public\.chat_messages/i);
  });
});
