import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("Demo Purchase page isolation", () => {
  it("uses a server-side environment gate before rendering the client UI", () => {
    const page = readFileSync(resolve(process.cwd(), "app/dev/page.tsx"), "utf8");

    expect(page).toContain("isDemoToolRuntimeEnabled");
    expect(page).toContain("notFound()");
    expect(page).not.toContain('"use client"');
  });
});
