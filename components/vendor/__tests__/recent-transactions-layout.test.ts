import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  resolve(process.cwd(), "components/vendor/recent-transactions.tsx"),
  "utf8",
);

describe("recent transactions detail layout", () => {
  it("uses the shared centered detail modal instead of a right drawer", () => {
    expect(source).toContain(
      "import CenteredDetailModal from '@/components/ui/centered-detail-modal';",
    );
    expect(source).not.toContain("absolute right-0 top-0");
  });
});
