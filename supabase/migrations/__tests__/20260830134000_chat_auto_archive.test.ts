import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migrationPath = resolve(process.cwd(), "supabase/migrations/20260830134000_chat_auto_archive.sql");

describe("Chat auto-archive forward migration", () => {
  it("restores a status-only, service-role-only archive RPC", () => {
    expect(existsSync(migrationPath)).toBe(true);
    if (!existsSync(migrationPath)) return;
    const sql = readFileSync(migrationPath, "utf8");

    expect(sql).toContain("CREATE OR REPLACE FUNCTION public.archive_inactive_chats(days INT)");
    expect(sql).toContain("SET status = 'archived', archived_at = now()");
    expect(sql).not.toMatch(/DELETE\s+FROM\s+public\.chat_messages/i);
    expect(sql).toMatch(/REVOKE ALL ON FUNCTION public\.archive_inactive_chats\(INT\) FROM PUBLIC, anon, authenticated/i);
    expect(sql).toMatch(/GRANT EXECUTE ON FUNCTION public\.archive_inactive_chats\(INT\) TO service_role/i);
  });

  it("registers the protected archive route with the production scheduler", () => {
    const vercel = readFileSync(resolve(process.cwd(), "vercel.json"), "utf8");
    const route = readFileSync(resolve(process.cwd(), "app/api/cron/archive-chats/route.ts"), "utf8");
    expect(vercel).toContain('"path": "/api/cron/archive-chats"');
    expect(route).toContain("export async function GET(request: Request)");
  });
});
