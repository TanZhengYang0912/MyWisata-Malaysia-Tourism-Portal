import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function read(path: string) {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

describe("Vendor camera scanner contract", () => {
  it("has one role-aware scanner route and camera decoder", () => {
    const page = read("app/vendor/scanner/page.tsx");
    const scanner = read("components/vendor/redemption-scanner.tsx");
    expect(page).toContain("RedemptionScanner");
    expect(scanner).toContain("BrowserMultiFormatReader");
    expect(scanner).toContain("getUserMedia");
    expect(scanner).toContain("BarcodeFormat.CODE_128");
  });

  it("requires resolve before redeem and keeps the scanner only in outlet manager navigation", () => {
    const scanner = read("components/vendor/redemption-scanner.tsx");
    const sidebar = read("components/layout/vendor-sidebar.tsx");
    expect(scanner).toContain("/scanner/resolve");
    expect(scanner).toContain("/scanner/redeem-voucher");
    expect(scanner).toContain('ui.scanner.confirm');
    expect(sidebar).toContain("/vendor/scanner");
    expect(sidebar).toContain("OUTLET_MANAGER_SECTIONS");
    expect(scanner).toContain("outlets.length > 1");
    expect(scanner).toContain("result.pass?.policy === 'group_entry'");
    expect(scanner).toContain("oneEntryPerScan");
  });

  it("places recent activity beside the live scanner and keeps manual entry in the toolbar modes", () => {
    const scanner = read("components/vendor/redemption-scanner.tsx");
    expect(scanner).toContain('lg:grid-cols-[minmax(0,1.2fr)_minmax(340px,0.8fr)]');
    expect(scanner).toContain('activeTab === "scanner"');
    expect(scanner).toContain('recentLogs.slice(0, 4)');
    expect(scanner).toContain('sm:grid-cols-2');
    expect(scanner).toContain('Recent activity panel');
    expect(scanner).toContain('t("ui.scanner.manualTab"');
  });
});
