import React, { act } from "react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import {
  TestEvent,
  findElements,
  findOne,
  installTestDom,
  type TestDocument,
  type TestElement,
} from "@/components/shared/__tests__/render-test-dom";

const mocks = vi.hoisted(() => ({ fetch: vi.fn() }));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: { resolvedLanguage: "en" } }),
}));
vi.mock("lucide-react", () => ({
  CheckCircle2: (props: Record<string, unknown>) => <svg {...props} />,
  RefreshCw: (props: Record<string, unknown>) => <svg {...props} />,
  Search: (props: Record<string, unknown>) => <svg {...props} />,
  ShieldCheck: (props: Record<string, unknown>) => <svg {...props} />,
  UserPlus: (props: Record<string, unknown>) => <svg {...props} />,
}));
vi.mock("@/components/ui/button", () => ({
  Button: (props: React.ComponentProps<"button">) => <button {...props} />,
}));
vi.mock("@/components/providers/app-dialog", () => ({
  useAppDialog: () => ({
    prompt: vi.fn().mockResolvedValue(null),
    confirm: vi.fn().mockResolvedValue(true),
    alert: vi.fn().mockResolvedValue(undefined),
  }),
}));
vi.mock("@/components/admin/confirm-dialog", () => ({
  AdminConfirmDialog: ({ open, title, description, confirmLabel, onConfirm }: {
    open: boolean;
    title: string;
    description: React.ReactNode;
    confirmLabel: string;
    onConfirm: () => void;
  }) => open ? <section data-confirm-dialog="true">
    <h2>{title}</h2>
    <div>{description}</div>
    <button onClick={onConfirm}>{confirmLabel}</button>
  </section> : null,
}));

import { StaffRolesTab } from "@/components/admin/access-control/staff-roles-tab";

let createRoot: typeof import("react-dom/client").createRoot;
let root: ReturnType<typeof import("react-dom/client").createRoot> | undefined;
let document: TestDocument;
let container: TestElement;
let roleAssignments: Array<{
  id: string;
  roleId: string;
  userId: string;
  assignedBy: string | null;
  revokedAt: string | null;
  createdAt: string | null;
}>;

function response(body: unknown, status = 200) {
  return { ok: status >= 200 && status < 300, status, json: async () => body } as Response;
}

async function setValue(element: TestElement, value: string) {
  await act(async () => {
    const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(element), "value")?.set;
    setter?.call(element, value);
    element.dispatchEvent(new TestEvent("input", { bubbles: true }));
    await Promise.resolve();
  });
}

async function click(element: TestElement) {
  await act(async () => {
    element.dispatchEvent(new TestEvent("click", { bubbles: true }));
    await Promise.resolve();
    await Promise.resolve();
  });
}

async function submit(element: TestElement) {
  await act(async () => {
    element.dispatchEvent(new TestEvent("submit", { bubbles: true }));
    await Promise.resolve();
    await Promise.resolve();
  });
}

async function selectValue(element: TestElement, value: string) {
  await act(async () => {
    const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(element), "value")?.set;
    setter?.call(element, value);
    element.dispatchEvent(new TestEvent("change", { bubbles: true }));
    await Promise.resolve();
  });
}

async function selectModule(key: string) {
  const label = findOne(container, (element) =>
    element.tagName === "LABEL" && element.textContent.includes(key));
  const checkbox = findOne(label, (element) =>
    element.tagName === "INPUT" && element.type === "checkbox");
  (checkbox as TestElement & { checked: boolean }).checked = true;
  await click(checkbox);
}

describe("StaffRolesTab", () => {
  beforeAll(async () => {
    document = installTestDom();
    ({ createRoot } = await import("react-dom/client"));
  });

  beforeEach(() => {
    roleAssignments = [];
    mocks.fetch.mockReset();
    vi.stubGlobal("fetch", mocks.fetch);
    mocks.fetch.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url === "/api/admin/access-control/staff-modules" && !init?.method) {
        return response({
          data: {
            permissions: [
              { id: "p1", key: "admin.kyc.review", module: "admin", action: "kyc.review", description: "Review KYC" },
              { id: "p2", key: "admin.withdrawal.approve", module: "admin", action: "withdrawal.approve", description: "Approve withdrawals" },
              { id: "p3", key: "admin.vendor.manage", module: "admin", action: "vendor.manage", description: "Manage vendors" },
              { id: "p4", key: "admin.map_campaign.manage", module: "admin", action: "map_campaign.manage", description: "Manage campaigns" },
              { id: "p5", key: "admin.catalogue.review", module: "catalogue", action: "review", description: "Review catalogue" },
            ],
            groups: [{ id: "g1", key: "catalogue_governance", name: "Catalogue governance", description: "Locked workflow", isSystem: true, isActive: true, moduleKeys: ["catalogue_review", "vendor_approvals"] }],
            modules: [
              { id: "m1", key: "vendor_approvals", label: "Vendor Approvals", labelKey: null, description: "Manage vendors", sectionKey: "governance", sectionLabel: "Governance", sectionLabelKey: null, sectionSortOrder: 20, href: "/admin/vendors", iconKey: "package", sortOrder: 10, isActive: true, isSystem: true, groupKey: "catalogue_governance", groupName: "Catalogue governance", permissionKeys: ["admin.vendor.manage"] },
              { id: "m2", key: "catalogue_review", label: "Catalogue Review", labelKey: null, description: "Review catalogue", sectionKey: "governance", sectionLabel: "Governance", sectionLabelKey: null, sectionSortOrder: 20, href: "/admin/catalogue", iconKey: "clipboard-check", sortOrder: 20, isActive: true, isSystem: true, groupKey: "catalogue_governance", groupName: "Catalogue governance", permissionKeys: ["admin.catalogue.review"] },
              { id: "m3", key: "kyc_review", label: "KYC Review", labelKey: null, description: "Review KYC", sectionKey: "governance", sectionLabel: "Governance", sectionLabelKey: null, sectionSortOrder: 20, href: "/admin/kyc", iconKey: "shield", sortOrder: 30, isActive: true, isSystem: true, groupKey: null, groupName: null, permissionKeys: ["admin.kyc.review"] },
              { id: "m4", key: "withdrawals", label: "Withdrawals", labelKey: null, description: "Approve withdrawals", sectionKey: "finance", sectionLabel: "Finance", sectionLabelKey: null, sectionSortOrder: 30, href: "/admin/withdrawals", iconKey: "dollar-sign", sortOrder: 10, isActive: true, isSystem: true, groupKey: null, groupName: null, permissionKeys: ["admin.withdrawal.approve"] },
              { id: "m5", key: "sponsored_placements", label: "Sponsored Placements", labelKey: null, description: "Manage campaigns", sectionKey: "governance", sectionLabel: "Governance", sectionLabelKey: null, sectionSortOrder: 20, href: "/admin/sponsored-placements", iconKey: "megaphone", sortOrder: 40, isActive: true, isSystem: true, groupKey: null, groupName: null, permissionKeys: ["admin.map_campaign.manage"] },
              { id: "m6", key: "support_tickets", label: "Support Tickets", labelKey: null, description: "Support queue", sectionKey: "support", sectionLabel: "Support", sectionLabelKey: null, sectionSortOrder: 40, href: "/admin/support", iconKey: "inbox", sortOrder: 10, isActive: true, isSystem: true, groupKey: null, groupName: null, permissionKeys: [] },
              { id: "m7", key: "chat_reports", label: "Chat Reports", labelKey: null, description: "Chat moderation queue", sectionKey: "support", sectionLabel: "Support", sectionLabelKey: null, sectionSortOrder: 40, href: "/admin/chat-reports", iconKey: "flag", sortOrder: 20, isActive: true, isSystem: true, groupKey: null, groupName: null, permissionKeys: [] },
            ],
          },
          error: null,
        });
      }
      if (url === "/api/admin/access-control/staff-roles" && !init?.method) {
        return response({
          data: {
            roles: [
              { id: "legacy-admin", name: "Legacy Admin", description: "Compatibility role", isSystem: true, isActive: true, moduleKeys: ["vendor_approvals", "catalogue_review", "kyc_review"], permissionKeys: ["admin.kyc.review", "admin.vendor.manage", "admin.catalogue.review"], createdBy: null, createdAt: null, updatedAt: null },
              { id: "legacy-wallet", name: "Legacy Wallet Approver", description: "Compatibility role", isSystem: true, isActive: true, moduleKeys: ["withdrawals"], permissionKeys: ["admin.withdrawal.approve"], createdBy: null, createdAt: null, updatedAt: null },
              { id: "sponsor-template", name: "Sponsored Placement Manager", description: "Sponsored Placements template", isSystem: true, isActive: true, moduleKeys: ["sponsored_placements"], permissionKeys: ["admin.map_campaign.manage"], createdBy: null, createdAt: null, updatedAt: null },
              { id: "custom-role", name: "Campaign Manager", description: "Campaign access", isSystem: false, isActive: true, moduleKeys: ["sponsored_placements"], permissionKeys: ["admin.map_campaign.manage"], createdBy: "actor", createdAt: null, updatedAt: null },
            ],
            assignments: roleAssignments,
            employees: [],
          },
          error: null,
        });
      }
      if (url === "/api/admin/access-control/staff-invitations" && !init?.method) {
        return response({ data: { invitations: [] }, error: null });
      }
      if (url === "/api/admin/access-control/staff-invitations" && init?.method === "POST") {
        return response({ data: { id: "invite-1", status: "pending", deliveryStatus: "sent" }, error: null }, 201);
      }
      if (url === "/api/admin/access-control/staff-roles" && init?.method === "POST") {
        return response({ data: { roleId: "role-1", auditEventId: "audit-1" }, error: null }, 201);
      }
      if (url === "/api/admin/access-control/staff-modules" && init?.method === "POST") {
        return response({ data: { moduleId: "module-new", auditEventId: "audit-module" }, error: null }, 201);
      }
      if (url === "/api/admin/access-control/staff-candidates?search=Ali") {
        return response({
          data: {
            candidates: [{
              id: "22222222-2222-4222-8222-222222222222",
              email: "ali@example.com",
              name: "Ali Staff",
              roles: ["admin"],
            }],
          },
          error: null,
        });
      }
      if (url === "/api/admin/access-control/staff-candidates?search=Nobody") {
        return response({ data: { candidates: [] }, error: null });
      }
      if (url === "/api/admin/access-control/staff-roles/custom-role/assignments" && init?.method === "POST") {
        return response({ data: { assignmentId: "assignment-1", auditEventId: "audit-2" }, error: null }, 201);
      }
      throw new Error(`Unexpected request: ${url}`);
    });
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container as unknown as Element);
  });

  afterEach(() => {
    if (root) act(() => root?.unmount());
    root = undefined;
    document.body.removeChild(container);
    vi.unstubAllGlobals();
  });

  it("creates a role with exactly the selected Module keys and governance reason", async () => {
    await act(async () => {
      root?.render(<StaffRolesTab onViewAudit={vi.fn()} />);
    });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 10));
      await Promise.resolve();
      await Promise.resolve();
    });

    const inputs = findElements(container, (element) => element.tagName === "INPUT");
    const textareas = findElements(container, (element) => element.tagName === "TEXTAREA");
    expect(container.textContent).toContain("kyc_review");
    await setValue(inputs.find((input) => (input as TestElement & { name?: string }).name === "role-name")!, "Operations Reviewer");
    await setValue(textareas[0]!, "Reviews vendors and KYC");
    await selectModule("kyc_review");
    await selectModule("vendor_approvals");
    await selectModule("support_tickets");
    await selectModule("chat_reports");
    await setValue(textareas[1]!, "Lecturer demonstration role");

    await click(findOne(container, (element) => element.tagName === "BUTTON" && element.textContent.includes("accessControl.staffRoles.reviewSave")));
    await click(findOne(container, (element) => element.tagName === "BUTTON" && element.textContent === "accessControl.staffRoles.confirmSave"));

    const post = mocks.fetch.mock.calls.find(([url, init]) =>
      url === "/api/admin/access-control/staff-roles" && (init as RequestInit | undefined)?.method === "POST");
    expect(post).toBeDefined();
    expect(JSON.parse(String((post?.[1] as RequestInit).body))).toEqual({
      name: "Operations Reviewer",
      description: "Reviews vendors and KYC",
      moduleKeys: ["catalogue_review", "chat_reports", "kyc_review", "support_tickets", "vendor_approvals"],
      reason: "Lecturer demonstration role",
    });
  });

  it("checks and unchecks the Catalogue governance Module group atomically", async () => {
    await act(async () => { root?.render(<StaffRolesTab onViewAudit={vi.fn()} />); });
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 10)); });

    await selectModule("vendor_approvals");
    const vendorLabel = findOne(container, (element) => element.tagName === "LABEL" && element.textContent.includes("vendor_approvals"));
    const catalogueLabel = findOne(container, (element) => element.tagName === "LABEL" && element.textContent.includes("catalogue_review"));
    expect((findOne(vendorLabel, (element) => element.tagName === "INPUT") as TestElement & { checked: boolean }).checked).toBe(true);
    expect((findOne(catalogueLabel, (element) => element.tagName === "INPUT") as TestElement & { checked: boolean }).checked).toBe(true);
    expect(container.textContent).toContain("accessControl.staffRoles.lockedGroup");

    const catalogueCheckbox = findOne(catalogueLabel, (element) => element.tagName === "INPUT") as TestElement & { checked: boolean };
    catalogueCheckbox.checked = false;
    await click(catalogueCheckbox);
    expect((findOne(vendorLabel, (element) => element.tagName === "INPUT") as TestElement & { checked: boolean }).checked).toBe(false);
    expect((findOne(catalogueLabel, (element) => element.tagName === "INPUT") as TestElement & { checked: boolean }).checked).toBe(false);
  });

  it("shows Legacy presets as inspectable permission roles without making them editable", async () => {
    await act(async () => {
      root?.render(<StaffRolesTab onViewAudit={vi.fn()} />);
    });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 10));
    });

    const legacyWalletCard = findOne(container, (element) =>
      element.tagName === "ARTICLE" && element.textContent.includes("Legacy Wallet Approver"));
    expect(legacyWalletCard.textContent).toContain("accessControl.staffRoles.systemPreset");
    expect(legacyWalletCard.textContent).toContain("accessControl.staffRoles.permissionLabels.withdrawalApprove");
    expect(legacyWalletCard.textContent).toContain("admin.withdrawal.approve");
    expect(findElements(legacyWalletCard, (element) =>
      element.tagName === "BUTTON" && element.textContent.includes("accessControl.staffRoles.editRole"))).toHaveLength(0);

    const roleSelects = findElements(container, (element) => element.tagName === "SELECT");
    expect(roleSelects.every((roleSelect) => !roleSelect.textContent.includes("Legacy Admin"))).toBe(true);
    expect(roleSelects.every((roleSelect) => !roleSelect.textContent.includes("Legacy Wallet Approver"))).toBe(true);
    await click(findOne(legacyWalletCard, (element) =>
      element.tagName === "BUTTON" && element.textContent.includes("accessControl.staffRoles.useTemplate")));
    const roleName = findOne(container, (element) => (element as TestElement & { name?: string }).name === "role-name");
    expect(roleName.value).toBe("Wallet Approver");
  });

  it("copies the Sponsored Placement Manager template into an assignable role draft", async () => {
    await act(async () => {
      root?.render(<StaffRolesTab onViewAudit={vi.fn()} />);
    });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 10));
    });

    const templateCard = findOne(container, (element) =>
      element.tagName === "ARTICLE" && element.textContent.includes("Sponsored Placement Manager"));
    expect(templateCard.textContent).toContain("admin.map_campaign.manage");
    expect(findElements(templateCard, (element) =>
      element.tagName === "BUTTON" && element.textContent.includes("accessControl.staffRoles.editRole"))).toHaveLength(0);
    const roleSelects = findElements(container, (element) => element.tagName === "SELECT");
    expect(roleSelects.every((roleSelect) => !roleSelect.textContent.includes("Sponsored Placement Manager"))).toBe(true);

    await click(findOne(templateCard, (element) =>
      element.tagName === "BUTTON" && element.textContent.includes("accessControl.staffRoles.useTemplate")));

    const roleName = findOne(container, (element) =>
      (element as TestElement & { name?: string }).name === "role-name");
    expect(roleName.value).toBe("Sponsor Manager");

    const moduleLabels = findElements(container, (element) =>
      element.tagName === "LABEL" && element.textContent.includes("sponsored_placements"));
    const selectedModuleKeys = moduleLabels
      .filter((label) => (findOne(label, (element) => element.tagName === "INPUT") as TestElement & { checked: boolean }).checked)
      .map((label) => label.textContent);
    expect(selectedModuleKeys).toHaveLength(1);
    expect(selectedModuleKeys[0]).toContain("sponsored_placements");
  });

  it("reviews and sends a new employee invitation using only a custom role", async () => {
    await act(async () => { root?.render(<StaffRolesTab onViewAudit={vi.fn()} />); });
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 10)); });

    const email = findOne(container, (element) => element.getAttribute("id") === "invitation-email");
    const reason = findOne(container, (element) => element.getAttribute("id") === "invitation-reason");
    await setValue(email, "new.staff@example.com");
    await setValue(reason, "Invite a dedicated campaign operations employee");
    await click(findOne(container, (element) => element.tagName === "BUTTON" && element.textContent.includes("accessControl.staffRoles.reviewInvitation")));
    const dialog = findOne(container, (element) => element.getAttribute("data-confirm-dialog") === "true");
    expect(dialog.textContent).toContain("new.staff@example.com");
    expect(dialog.textContent).toContain("Campaign Manager");
    expect(dialog.textContent).toContain("accessControl.staffRoles.permissionLabels.mapCampaignManage");
    await click(findOne(dialog, (element) => element.tagName === "BUTTON" && element.textContent.includes("accessControl.staffRoles.sendInvitation")));

    const post = mocks.fetch.mock.calls.find(([url, init]) => url === "/api/admin/access-control/staff-invitations" && (init as RequestInit | undefined)?.method === "POST");
    expect(JSON.parse(String((post?.[1] as RequestInit).body))).toEqual({
      email: "new.staff@example.com",
      staffRoleId: "custom-role",
      locale: "en",
      reason: "Invite a dedicated campaign operations employee",
    });
  });

  it("previews and confirms the exact additive permissions before submitting the selected UUID", async () => {
    await act(async () => {
      root?.render(<StaffRolesTab onViewAudit={vi.fn()} />);
    });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 10));
    });

    const roleSelect = findOne(container, (element) => element.getAttribute("id") === "assignment-role");
    await selectValue(roleSelect, "custom-role");
    const searchInput = findOne(container, (element) =>
      (element as TestElement & { name?: string }).name === "staff-search");
    await setValue(searchInput, "Ali");
    await submit(findOne(container, (element) => element.tagName === "FORM"));
    await act(async () => { await Promise.resolve(); });

    const candidate = findOne(container, (element) =>
      element.tagName === "BUTTON" && element.textContent.includes("ali@example.com"));
    await click(candidate);
    expect(container.textContent).toContain("Ali Staff");

    const assignmentReason = findOne(container, (element) => element.getAttribute("id") === "assignment-reason");
    await setValue(assignmentReason, "Add a second wallet approver");
    await click(findOne(container, (element) =>
      element.tagName === "BUTTON" && element.textContent.includes("accessControl.staffRoles.reviewGrant")));

    const dialog = findOne(container, (element) => element.getAttribute("data-confirm-dialog") === "true");
    expect(dialog.textContent).toContain("Ali Staff");
    expect(dialog.textContent).toContain("ali@example.com");
    expect(dialog.textContent).toContain("Campaign Manager");
    expect(dialog.textContent).toContain("accessControl.staffRoles.permissionLabels.mapCampaignManage");
    expect(dialog.textContent).toContain("Add a second wallet approver");
    expect(dialog.textContent).toContain("accessControl.staffRoles.existingPermissionsUnchanged");
    await click(findOne(dialog, (element) =>
      element.tagName === "BUTTON" && element.textContent.includes("accessControl.staffRoles.grantPermissions")));

    const assignmentPost = mocks.fetch.mock.calls.find(([url, init]) =>
      url === "/api/admin/access-control/staff-roles/custom-role/assignments"
      && (init as RequestInit | undefined)?.method === "POST");
    expect(assignmentPost).toBeDefined();
    expect(JSON.parse(String((assignmentPost?.[1] as RequestInit).body))).toEqual({
      userId: "22222222-2222-4222-8222-222222222222",
      reason: "Add a second wallet approver",
    });
  });

  it("blocks an active duplicate role assignment", async () => {
    roleAssignments = [{
      id: "assignment-existing",
      roleId: "custom-role",
      userId: "22222222-2222-4222-8222-222222222222",
      assignedBy: "actor",
      revokedAt: null,
      createdAt: "2026-09-06T00:00:00.000Z",
    }];
    await act(async () => {
      root?.render(<StaffRolesTab onViewAudit={vi.fn()} />);
    });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 10));
    });

    const roleSelect = findOne(container, (element) => element.getAttribute("id") === "assignment-role");
    await selectValue(roleSelect, "custom-role");
    const searchInput = findOne(container, (element) =>
      (element as TestElement & { name?: string }).name === "staff-search");
    await setValue(searchInput, "Ali");
    await submit(findOne(container, (element) => element.tagName === "FORM"));
    await click(findOne(container, (element) =>
      element.tagName === "BUTTON" && element.textContent.includes("ali@example.com")));
    const assignmentReason = findOne(container, (element) => element.getAttribute("id") === "assignment-reason");
    await setValue(assignmentReason, "Keep wallet review coverage");

    expect(container.textContent).toContain("accessControl.staffRoles.alreadyAssigned");
    const reviewButton = findOne(container, (element) =>
      element.tagName === "BUTTON" && element.textContent.includes("accessControl.staffRoles.reviewGrant"));
    expect(reviewButton.disabled).toBe(true);
    expect(mocks.fetch.mock.calls.some(([url, init]) =>
      url === "/api/admin/access-control/staff-roles/custom-role/assignments"
      && (init as RequestInit | undefined)?.method === "POST")).toBe(false);
  });

  it("allows a previously revoked role to be assigned again", async () => {
    roleAssignments = [{
      id: "assignment-revoked",
      roleId: "custom-role",
      userId: "22222222-2222-4222-8222-222222222222",
      assignedBy: "actor",
      revokedAt: "2026-09-05T00:00:00.000Z",
      createdAt: "2026-09-04T00:00:00.000Z",
    }];
    await act(async () => {
      root?.render(<StaffRolesTab onViewAudit={vi.fn()} />);
    });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 10));
    });

    await selectValue(findOne(container, (element) => element.getAttribute("id") === "assignment-role"), "custom-role");
    const searchInput = findOne(container, (element) =>
      (element as TestElement & { name?: string }).name === "staff-search");
    await setValue(searchInput, "Ali");
    await submit(findOne(container, (element) => element.tagName === "FORM"));
    await click(findOne(container, (element) =>
      element.tagName === "BUTTON" && element.textContent.includes("ali@example.com")));
    await setValue(findOne(container, (element) => element.getAttribute("id") === "assignment-reason"), "Restore wallet review coverage");

    expect(container.textContent).not.toContain("accessControl.staffRoles.alreadyAssigned");
    expect(findOne(container, (element) =>
      element.tagName === "BUTTON" && element.textContent.includes("accessControl.staffRoles.reviewGrant")).disabled).toBe(false);
  });

  it("shows a distinct empty result only after a completed staff search", async () => {
    await act(async () => {
      root?.render(<StaffRolesTab onViewAudit={vi.fn()} />);
    });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 10));
    });

    expect(container.textContent).not.toContain("accessControl.staffRoles.noStaffResults");
    const searchInput = findOne(container, (element) =>
      (element as TestElement & { name?: string }).name === "staff-search");
    await setValue(searchInput, "Nobody");
    await submit(findOne(container, (element) => element.tagName === "FORM"));
    await act(async () => { await Promise.resolve(); });

    expect(container.textContent).toContain("accessControl.staffRoles.noStaffResults");
  });
});
