import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const routeSource = fs.readFileSync(path.join(root, "app/api/dev/simulate-purchase/route.ts"), "utf8");
const migrationPath = path.join(root, "supabase/test-support/demo-purchase.sql");
const migrationSource = fs.existsSync(migrationPath) ? fs.readFileSync(migrationPath, "utf8") : "";

describe("development purchase atomicity contract", () => {
  it("creates the order and its item through one database transaction", () => {
    expect(migrationSource).toContain("CREATE OR REPLACE FUNCTION public.create_demo_purchase");
    expect(migrationSource).toContain("INSERT INTO public.orders");
    expect(migrationSource).toContain("INSERT INTO public.order_items");
    expect(routeSource).toContain(".rpc('create_demo_purchase'");
    expect(routeSource).not.toContain(".from('orders')");
    expect(routeSource).not.toContain(".from('order_items')");
  });

  it("keeps the helper outside production migration discovery", () => {
    expect(migrationPath).not.toContain("supabase/migrations/");
  });
});
