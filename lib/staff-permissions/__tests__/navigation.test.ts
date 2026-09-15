import { describe, expect, it } from "vitest";
import { staffNavigationSections } from "@/lib/staff-permissions/navigation";
import type { StaffModule } from "@/lib/staff-permissions/types";

function moduleRecord(overrides: Partial<StaffModule>): StaffModule {
  return {
    id: "module-id",
    key: "overview",
    label: "Overview",
    labelKey: null,
    description: null,
    sectionKey: "workspace",
    sectionLabel: "Workspace",
    sectionLabelKey: null,
    sectionSortOrder: 10,
    href: "/admin/dashboard",
    iconKey: "activity",
    sortOrder: 10,
    groupKey: null,
    groupName: null,
    permissionKeys: [],
    ...overrides,
  };
}

describe("database-driven Staff navigation", () => {
  it("groups and orders arbitrary database Modules without a fixed destination catalogue", () => {
    const sections = staffNavigationSections([
      moduleRecord({ id: "catalogue", key: "catalogue_review", label: "Catalogue", sectionKey: "governance", sectionLabel: "Governance", sectionSortOrder: 20, href: "/admin/catalogue", iconKey: "clipboard-check", sortOrder: 20 }),
      moduleRecord({ id: "vendor", key: "vendor_approvals", label: "Vendors", sectionKey: "governance", sectionLabel: "Governance", sectionSortOrder: 20, href: "/admin/vendors", iconKey: "unknown-future-icon", sortOrder: 10 }),
      moduleRecord({ id: "home" }),
    ]);

    expect(sections.map((section) => section.key)).toEqual(["workspace", "governance"]);
    expect(sections[1].items.map((item) => item.href)).toEqual(["/admin/vendors", "/admin/catalogue"]);
    expect(sections[1].items.every((item) => typeof item.icon === "object" || typeof item.icon === "function")).toBe(true);
  });

  it("returns no navigation for zero effective Modules", () => {
    expect(staffNavigationSections([])).toEqual([]);
  });
});
