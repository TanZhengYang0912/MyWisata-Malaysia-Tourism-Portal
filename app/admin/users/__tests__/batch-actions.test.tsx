import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const pageSource = readFileSync(resolve(process.cwd(), "app/admin/users/page.tsx"), "utf8");

describe("admin user batch outcome handling", () => {
  it("reports applied, rejected and uncertain requests separately", () => {
    expect(pageSource).toContain("Promise.allSettled(chunk.map");
    expect(pageSource).toContain("outcomes.applied += 1");
    expect(pageSource).toContain("outcomes.rejected += 1");
    expect(pageSource).toContain("outcomes.unknown += 1");
    expect(pageSource).toContain('t("ui.users.batch.outcomes", outcomes)');
  });

  it("refreshes current records and limits concurrent writes to five", () => {
    expect(pageSource).toContain("index += 5");
    const batchStart = pageSource.indexOf("async function applyBatch");
    expect(pageSource.indexOf("await load();", batchStart)).toBeGreaterThan(batchStart);
    expect(pageSource.indexOf("setSelectedIds(new Set())", batchStart)).toBeLessThan(pageSource.indexOf("await load();", batchStart));
  });
});
