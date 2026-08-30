import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const pagePath = resolve(process.cwd(), "app/customer/verification/page.tsx");
const pageSource = existsSync(pagePath) ? readFileSync(pagePath, "utf8") : "";

describe("legacy account verification route contract", () => {
  it("redirects to the existing Profile editor without rendering a duplicate hub", () => {
    expect(pageSource).toContain('import { redirect } from "next/navigation"');
    expect(pageSource).toContain('redirect("/customer/profile")');
    expect(pageSource).not.toContain("INTENTS");
    expect(pageSource).not.toContain("capabilities");
    expect(pageSource).not.toContain("What would you like to do?");
    expect(pageSource).not.toContain("CustomerPageTitle");
  });
});
