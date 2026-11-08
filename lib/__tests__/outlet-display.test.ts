import { describe, expect, it } from "vitest";
import { outletRepeatsVendor, outletShortName } from "@/lib/outlet-display";

describe("outletRepeatsVendor", () => {
  it("is true only when the outlet label adds nothing to the vendor name", () => {
    expect(outletRepeatsVendor("Yati Ayam Percik", "Yati Ayam Percik")).toBe(true);
    expect(outletRepeatsVendor(" yati ayam percik ", "Yati Ayam Percik")).toBe(true);
    expect(outletRepeatsVendor("Warisan Cultural Journeys — Ipoh", "Warisan Cultural Journeys")).toBe(false);
    expect(outletRepeatsVendor("Kuantan Studio", "Batik Nusantara Studio")).toBe(false);
    expect(outletRepeatsVendor("Outlet", null)).toBe(false);
  });
});

describe("outletShortName", () => {
  it("strips an exact vendor-name prefix", () => {
    expect(outletShortName("Warisan Cultural Journeys — Ipoh", "Warisan Cultural Journeys")).toBe("Ipoh");
  });

  it("falls back to the first em-dash split when the outlet uses a shortened brand prefix", () => {
    expect(outletShortName("Rasa Malaysia — Seremban Gateway", "Rasa Malaysia Kitchen")).toBe("Seremban Gateway");
  });

  it("returns the name unchanged when there is no separator to split on", () => {
    expect(outletShortName("Kuantan Studio", "Batik Nusantara Studio")).toBe("Kuantan Studio");
  });

  it("returns Unassigned outlet for a missing name", () => {
    expect(outletShortName(null)).toBe("Unassigned outlet");
    expect(outletShortName(undefined)).toBe("Unassigned outlet");
    expect(outletShortName("  ")).toBe("Unassigned outlet");
  });

  it("splits on the em-dash even without a vendor name", () => {
    expect(outletShortName("Rasa Malaysia — KLCC")).toBe("KLCC");
  });

  it("falls back to the full name when stripping the prefix would leave nothing", () => {
    expect(outletShortName("Rasa Malaysia Kitchen — ", "Rasa Malaysia Kitchen")).toBe("Rasa Malaysia Kitchen —");
  });
});
