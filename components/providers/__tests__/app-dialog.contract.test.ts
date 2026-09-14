import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const workspace = process.cwd();
const read = (file: string) => readFileSync(resolve(workspace, file), "utf8");
const nativeDialogPattern = /\bwindow\.(?:alert|confirm|prompt)\s*\(/;

const productionCallsites = [
  "app/admin/catalogue/page.tsx",
  "app/admin/chat-reports/page.tsx",
  "app/admin/sponsored-placements/page.tsx",
  "app/admin/users/page.tsx",
  "app/admin/vendors/page.tsx",
  "components/admin/access-control/staff-roles-tab.tsx",
  "app/customer/recommendations/page.tsx",
  "app/customer/trip/trip-hub-client.tsx",
  "app/customer/trip/[tripId]/trip-planner-client.tsx",
  "app/vendor/bookings/page.tsx",
  "app/vendor/products/page.tsx",
  "components/vendor/outlet-page-builder.tsx",
  "components/vendor/variant-manager.tsx",
  "components/vendor/voucher-csv-builder.tsx",
];

describe("application dialog contract", () => {
  it("provides the shared confirm, prompt, and alert surface", () => {
    const providerPath = "components/providers/app-dialog.tsx";
    expect(existsSync(resolve(workspace, providerPath))).toBe(true);
    const source = read(providerPath);
    expect(source).toContain("AppDialogProvider");
    expect(source).toContain("useAppDialog");
    expect(source).toContain('kind: "confirm"');
    expect(source).toContain('kind: "prompt"');
    expect(source).toContain('kind: "alert"');
    expect(source).toContain("DialogContent");
  });

  it("wires the provider above every application role", () => {
    const layoutSource = read("app/layout.tsx");
    expect(layoutSource).toContain('import { AppDialogProvider } from "@/components/providers/app-dialog"');
    expect(layoutSource).toContain("<AppDialogProvider>");
    expect(layoutSource).toContain("</AppDialogProvider>");
  });

  it("contains no native browser dialog calls in production callsites", () => {
    for (const file of productionCallsites) {
      expect(read(file), file).not.toMatch(nativeDialogPattern);
    }
  });

  it("keeps the shared dialog connected to the affected business flows", () => {
    expect(read("app/vendor/bookings/page.tsx")).toContain("useAppDialog");
    expect(read("app/admin/catalogue/page.tsx")).toContain("useAppDialog");
    expect(read("app/customer/recommendations/page.tsx")).toContain("useAppDialog");
    expect(read("components/vendor/variant-manager.tsx")).toContain("useAppDialog");
  });
});
