import { describe, expect, it } from "vitest";

import {
  isStaffPermissionKey,
  parseStaffModules,
  type StaffPermissionKey,
} from "@/lib/staff-permissions/types";

describe("dynamic staff permission and Module contracts", () => {
  it("accepts future database permission keys without a TypeScript catalogue edit", () => {
    expect(isStaffPermissionKey("admin.catalogue.review")).toBe(true);
    expect(isStaffPermissionKey("support.ticket.manage")).toBe(true);
    expect(isStaffPermissionKey("admin.unknown")).toBe(false);
    expect(isStaffPermissionKey("admin/catalogue/review")).toBe(false);

    const permission: StaffPermissionKey = "support.ticket.manage";
    expect(permission).toBe("support.ticket.manage");
  });

  it("parses only safe internal Admin Module records", () => {
    expect(parseStaffModules([
      {
        id: "module-1",
        key: "catalogue_review",
        label: "Catalogue Review",
        labelKey: "navigation.Catalogue Review",
        description: "Review listings",
        sectionKey: "governance",
        sectionLabel: "Governance",
        sectionLabelKey: "navigationSections.governance",
        sectionSortOrder: 20,
        href: "/admin/catalogue",
        iconKey: "clipboard-check",
        sortOrder: 20,
        groupKey: "catalogue_governance",
        groupName: "Catalogue governance",
        permissionKeys: ["admin.catalogue.review"],
      },
      { key: "external", href: "https://example.com" },
    ])).toEqual([expect.objectContaining({
      key: "catalogue_review",
      href: "/admin/catalogue",
      permissionKeys: ["admin.catalogue.review"],
    })]);
  });
});
