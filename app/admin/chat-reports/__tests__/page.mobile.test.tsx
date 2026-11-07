import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const pageSource = readFileSync(resolve(process.cwd(), "app/admin/chat-reports/page.tsx"), "utf8");

describe("chat report mobile dialogs", () => {
  it("bounds the conversation dialog to the dynamic viewport and keeps the thread scrollable", () => {
    expect(pageSource).toContain("max-h-[85dvh]");
    expect(pageSource).toContain("overflow-y-auto overscroll-contain");
    expect(pageSource).toContain("grid grid-cols-1 gap-3 text-xs sm:grid-cols-2");
    expect(pageSource).toContain("flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl");
  });

  it("keeps report values and both review actions reachable at phone width", () => {
    expect(pageSource).toContain("break-words");
    expect(pageSource).toContain("flex shrink-0 flex-col gap-2 sm:flex-row");
    expect(pageSource).toContain("max-h-[calc(100dvh-2rem)]");
    expect(pageSource).toContain("overflow-y-auto overscroll-contain");
    expect(pageSource).toContain("onClick={confirmResolve}");
  });

  it("keeps the full report summary above a touch-sized mobile action group", () => {
    expect(pageSource).toContain("AdminMobileRecordCard");
    expect(pageSource).toContain("space-y-3 p-3 lg:hidden");
    expect(pageSource).toContain("grid grid-cols-2 gap-2");
    expect(pageSource).toContain("col-span-2");
    expect(pageSource).toContain("hidden divide-y divide-border lg:block");
  });
});
