import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("account suspension appeal submission", () => {
  it("sends only the trimmed appeal body required by the strict appeal API", () => {
    const page = readFileSync(
      resolve(process.cwd(), "app/account-suspended/page.tsx"),
      "utf8",
    );

    expect(page).toContain("body: JSON.stringify({ body: body.trim() }),");
    expect(page).not.toContain('subject: "Account suspension appeal"');
  });
});
