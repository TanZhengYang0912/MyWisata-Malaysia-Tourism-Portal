import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  resolve(process.cwd(), "app/vendor/orders/page.tsx"),
  "utf8",
);

describe("vendor order details layout", () => {
  it("centers the bottom action row when the close action is shown", () => {
    expect(source).toContain(
      'className="mt-7 flex flex-wrap justify-center gap-2"',
    );
  });

  it("uses the shared centered detail modal instead of a right drawer", () => {
    expect(source).toContain(
      'import CenteredDetailModal from "@/components/ui/centered-detail-modal";',
    );
    expect(source).not.toContain("absolute right-0 top-0");
  });
});
