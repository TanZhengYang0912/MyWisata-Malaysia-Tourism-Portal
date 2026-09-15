import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  resolve(process.cwd(), "components/customer/voucher-redeem-dialog.tsx"),
  "utf8",
);

describe("customer voucher redeem dialog layout", () => {
  it("uses the shared centered detail modal shell", () => {
    expect(source).toContain(
      'import CenteredDetailModal from "@/components/ui/centered-detail-modal";',
    );
    expect(source).toContain("<CenteredDetailModal");
    expect(source).not.toContain("<DialogContent");
  });
});
