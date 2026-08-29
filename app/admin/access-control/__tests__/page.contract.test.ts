import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (file: string) => readFileSync(resolve(process.cwd(), file), "utf8");

describe("unified Access Control console", () => {
  it("uses the shared Admin shell and one five-tab destination", () => {
    const page = read("app/admin/access-control/page.tsx");
    const tabs = read("components/admin/access-control/access-control-tabs.tsx");

    expect(page).toContain("AdminPageHeader");
    expect(page).toContain("AdminPageShell");
    expect(page).toContain("AccessControlTabs");
    expect(page).toContain('useRequireRole(["super_admin"])');
    for (const tab of ["overview", "capabilities", "policies", "assignments", "audit-log"]) {
      expect(tabs).toContain(`\"${tab}\"`);
    }
  });

  it("keeps capability keys immutable while updating governed metadata", () => {
    const source = read("components/admin/access-control/capabilities-tab.tsx");
    expect(source).toContain('/api/admin/access-control/capabilities');
    expect(source).toMatch(/method:\s*"PATCH"/);
    expect(source).toContain("disabled");
    expect(source).toContain("AdminConfirmDialog");
    expect(source).toContain("auditEventId");
  });

  it("supports governed policy and assignment actions with linked audit receipts", () => {
    const policies = read("components/admin/access-control/policies-tab.tsx");
    const assignments = read("components/admin/access-control/assignments-tab.tsx");

    expect(policies).toContain("/versions");
    expect(policies).toContain("/approve");
    expect(policies).toContain("/activate");
    expect(policies).toContain("/rollback");
    expect(policies).toContain("auditEventId");
    expect(policies).toContain("setPolicyConfirmOpen(true)");
    expect(policies).not.toContain('["pending_approval", "scheduled"].includes(version.status)');
    expect(assignments).toContain('/api/admin/access-control/assignments');
    expect(assignments).toContain("/revoke");
    expect(assignments).toContain("auditEventId");
    expect(assignments).toContain("setAssignmentConfirmOpen(true)");
  });

  it("keeps the global Audit Log strictly read-only", () => {
    const source = read("components/admin/access-control/audit-log-tab.tsx");
    expect(source).toContain('/api/admin/access-control/audit-log');
    expect(source).not.toMatch(/method:\s*["'](?:POST|PATCH|DELETE)/);
    expect(source).toContain("before");
    expect(source).toContain("after");
    expect(source).toContain("traceReference");
  });
});
