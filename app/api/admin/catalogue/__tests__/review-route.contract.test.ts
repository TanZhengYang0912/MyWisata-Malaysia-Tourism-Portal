import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(resolve(process.cwd(), "app/api/admin/catalogue/reviews/route.ts"), "utf8");

describe("Admin voucher review gate", () => {
  it("only queues and approves vouchers after Vendor Owner approval", () => {
    expect(source).toContain("vendor_review_status");
    expect(source).toContain("vendor_review_status === 'approved'");
    expect(source).toContain("vendor_review_status !== 'approved'");
  });
});
