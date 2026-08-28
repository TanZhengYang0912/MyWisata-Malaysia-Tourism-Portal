import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const pageSource = readFileSync(resolve(process.cwd(), "app/guest/vendor/[vendorId]/page.tsx"), "utf8");

describe("guest vendor compatibility route", () => {
  it("redirects guests to the full customer vendor page", () => {
    expect(pageSource).toContain('redirect(`/customer/vendor/${encodeURIComponent(vendorId)}`)');
  });
});
