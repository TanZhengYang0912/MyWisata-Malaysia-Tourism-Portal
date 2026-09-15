import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(resolve(process.cwd(), "app/vendor/vouchers/page.tsx"), "utf8");
const detailSource = source.split("{selectedVoucher && <CenteredDetailModal")[1]?.split("{uploadOpen &&")[0] ?? "";

describe("vendor voucher details layout", () => {
  it("centers the reusable voucher preview instead of opening a right-side drawer", () => {
    expect(source).toContain("VoucherTicket");
    expect(source).toContain(
      "import CenteredDetailModal from '@/components/ui/centered-detail-modal';",
    );
    expect(source).not.toContain("absolute right-0 top-0");
    expect(source).not.toContain("<style jsx global>");
  });

  it("uses the shared action treatment without repeating ticket metadata", () => {
    expect(source).toContain('import { Button } from \'@/components/ui/button\';');
    expect(detailSource).toContain('<Button type="button"');
    expect(detailSource).toContain('variant="outline"');
    expect(detailSource).not.toContain("bg-amber-600 px-4 py-2.5");
    expect(detailSource).not.toContain("mt-6 space-y-3 text-sm");
  });
});
