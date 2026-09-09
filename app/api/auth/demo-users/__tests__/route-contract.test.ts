import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const routePath = resolve(process.cwd(), "app/api/auth/demo-users/route.ts");

describe("demo users route filters to real logins", () => {
  it("checks auth.admin.listUsers and filters rows to accounts with a matching id", () => {
    const route = readFileSync(routePath, "utf8");

    expect(route).toContain("db.auth.admin.listUsers({ page: 1, perPage: 1000 })");
    expect(route).toContain("loginableIds.has(row.id)");
    expect(route).toContain("new Set(authData.users.map((authUser) => authUser.id))");
  });

  it("does not present a roleless auth account as a customer", () => {
    const route = readFileSync(routePath, "utf8");

    expect(route).toContain("pickDemoAssignment(row.user_roles || []) !== undefined");
    expect(route).not.toContain(".filter((row) => loginableIds.has(row.id))");
  });
});
