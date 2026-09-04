import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const modalSource = readFileSync(
  resolve(process.cwd(), "components/customer/destination-preview-modal.tsx"),
  "utf8",
);

describe("Destination preview modal", () => {
  it("provides an accessible destination summary and exploration CTA", () => {
    expect(modalSource).toContain('role="dialog"');
    expect(modalSource).toContain('aria-modal="true"');
    expect(modalSource).toContain("destination.intro");
    expect(modalSource).toContain("destination.highlights.map");
    expect(modalSource).toContain('t("ui.map.exploreState", { state: destination.state })');
    expect(modalSource).toContain('t("ui.map.savedToAtlas")');
    expect(modalSource).toContain('t("ui.map.saveToAtlas")');
    expect(modalSource).toContain("useSavedDestinations");
    expect(modalSource).toContain("useCustomerCapabilityGate");
    expect(modalSource).toContain("aria-pressed");
    expect(modalSource).toContain("onClose");
    expect(modalSource).not.toContain("All states");
    expect(modalSource).not.toContain("<form");
  });
});
