import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migrationPath = resolve(process.cwd(), "supabase/migrations/052_admin_user_management.sql");

describe("admin user management RPC contract", () => {
  it("defines the secure list/detail/mutation functions", () => {
    const sql = readFileSync(migrationPath, "utf8");
    expect(sql).toContain("CREATE OR REPLACE FUNCTION public.admin_list_users(");
    expect(sql).toContain("CREATE OR REPLACE FUNCTION public.admin_get_user(");
    expect(sql).toContain("CREATE OR REPLACE FUNCTION public.admin_manage_user(");
    expect(sql).toContain("is_super_admin(auth.uid())");
  });

  it("protects privileged users, pending withdrawals, and writes audit notifications", () => {
    const sql = readFileSync(migrationPath, "utf8");
    expect(sql).toContain("super_admin', 'approver', 'admin");
    expect(sql).toContain("status IN ('pending', 'processing')");
    expect(sql).toContain("INSERT INTO public.audit_logs");
    expect(sql).toContain("INSERT INTO public.notifications");
  });
});
