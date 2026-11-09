import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migrationsDirectory = resolve(process.cwd(), "supabase/migrations");

function latestRedemptionHistoryFunction() {
  const definitions = readdirSync(migrationsDirectory)
    .filter((filename) => filename.endsWith(".sql"))
    .map((filename) => ({
      filename,
      source: readFileSync(resolve(migrationsDirectory, filename), "utf8"),
    }))
    .filter(({ source }) => source.includes("CREATE OR REPLACE FUNCTION public.list_vendor_redemption_history("))
    .sort((left, right) => left.filename.localeCompare(right.filename));
  const latest = definitions.at(-1);

  if (!latest) throw new Error("Vendor redemption history function migration is missing");
  const start = latest.source.indexOf("CREATE OR REPLACE FUNCTION public.list_vendor_redemption_history(");
  const end = latest.source.indexOf("$$;", start);
  if (end < 0) throw new Error("Vendor redemption history function body is incomplete");

  return latest.source.slice(start, end);
}

function normalizeSql(sql: string) {
  return sql.replace(/\s+/g, " ").replace(/\(\s+/g, "(").replace(/\s+\)/g, ")").trim();
}

describe("vendor redemption ticket eligibility migration", () => {
  it("includes admission-linked products and excludes unrelated non-ticket products", () => {
    const functionSql = latestRedemptionHistoryFunction();
    const ticketBranches = functionSql.split("UNION ALL").filter((branch) => /SELECT\s+(?:e|b)\.id::TEXT,\s*'ticket'/.test(branch));

    expect(ticketBranches).toHaveLength(2);
    for (const branch of ticketBranches) {
      expect(branch).toContain("LEFT JOIN public.products product ON product.id = oi.product_id");
      expect(normalizeSql(branch)).toContain(
        "AND (product.id IS NULL OR product.requires_booking IS TRUE OR EXISTS (SELECT 1 FROM public.product_places AS admission_place WHERE admission_place.product_id = product.id AND admission_place.relation_type = 'admission'))",
      );
    }
  });
});
