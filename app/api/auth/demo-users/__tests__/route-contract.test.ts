import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const routePath = resolve(process.cwd(), "app/api/auth/demo-users/route.ts");

describe("demo users route filters to real logins", () => {
  it("uses the bounded server-side loginable demo identity lookup", () => {
    const route = readFileSync(routePath, "utf8");

    expect(route).toContain("db.rpc('list_loginable_demo_user_ids')");
    expect(route).toContain("loginableIds.has(row.id)");
    expect(route).not.toContain("auth.admin.listUsers");
  });

  it("does not present a roleless auth account as a customer", () => {
    const route = readFileSync(routePath, "utf8");

    expect(route).toContain("pickDemoAssignment(row.user_roles || []) !== undefined");
    expect(route).not.toContain(".filter((row) => loginableIds.has(row.id))");
  });

  it("returns a stable safe error without exposing database messages", () => {
    const route = readFileSync(routePath, "utf8");

    expect(route).toContain("requestId");
    expect(route).toContain("DEMO_ACCOUNTS_UNAVAILABLE");
    expect(route).toContain("status: timedOut ? 504 : 500");
    expect(route).not.toContain("error.message");
  });

  it("bounds the service-role lookup so slow Supabase requests cannot hang the picker", () => {
    const route = readFileSync(routePath, "utf8");

    expect(route).toContain("AbortSignal.timeout(15_000)");
    expect(route).toContain("createServiceClient({ signal })");
    expect(route).toContain("DEMO_ACCOUNTS_TIMEOUT");
  });
});
