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
  useTranslation: () => ({ t: (key: string) => key }),
}));
vi.mock("lucide-react", () => ({
  CheckCircle2: (props: Record<string, unknown>) => <svg {...props} />,
  RefreshCw: (props: Record<string, unknown>) => <svg {...props} />,
  ShieldCheck: (props: Record<string, unknown>) => <svg {...props} />,
  UserPlus: (props: Record<string, unknown>) => <svg {...props} />,
}));
vi.mock("@/components/ui/button", () => ({
  Button: (props: React.ComponentProps<"button">) => <button {...props} />,
}));
vi.mock("@/components/admin/confirm-dialog", () => ({
  AdminConfirmDialog: ({ open, onConfirm }: { open: boolean; onConfirm: () => void }) =>
    open ? <button onClick={onConfirm}>confirm-role-save</button> : null,
}));

import { StaffRolesTab } from "@/components/admin/access-control/staff-roles-tab";

let createRoot: typeof import("react-dom/client").createRoot;
let root: ReturnType<typeof import("react-dom/client").createRoot> | undefined;
let document: TestDocument;
let container: TestElement;

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

async function selectPermission(key: string) {
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
    mocks.fetch.mockReset();
    vi.stubGlobal("fetch", mocks.fetch);
    mocks.fetch.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url === "/api/admin/access-control/staff-permissions") {
        return response({
          data: {
            permissions: [
              { id: "p1", key: "admin.kyc.review", module: "admin", action: "kyc.review", description: "Review KYC" },
              { id: "p2", key: "admin.withdrawal.approve", module: "admin", action: "withdrawal.approve", description: "Approve withdrawals" },
              { id: "p3", key: "admin.vendor.manage", module: "admin", action: "vendor.manage", description: "Manage vendors" },
              { id: "p4", key: "admin.map_campaign.manage", module: "admin", action: "map_campaign.manage", description: "Manage campaigns" },
            ],
          },
          error: null,
        });
      }
      if (url === "/api/admin/access-control/staff-roles" && !init?.method) {
        return response({ data: { roles: [], assignments: [] }, error: null });
      }
      if (url === "/api/admin/access-control/staff-roles" && init?.method === "POST") {
        return response({ data: { roleId: "role-1", auditEventId: "audit-1" }, error: null }, 201);
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

  it("creates a role with exactly the selected permission keys and governance reason", async () => {
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
    expect(container.textContent).toContain("admin.kyc.review");
    await setValue(inputs.find((input) => input.type === "text")!, "Operations Reviewer");
    await setValue(textareas[0]!, "Reviews vendors and KYC");
    await selectPermission("admin.kyc.review");
    await selectPermission("admin.vendor.manage");
    expect(inputs.filter((input) => input.type === "checkbox")).toHaveLength(4);
    await setValue(textareas[1]!, "Lecturer demonstration role");

    await click(findOne(container, (element) => element.tagName === "BUTTON" && element.textContent.includes("accessControl.staffRoles.reviewSave")));
    await click(findOne(container, (element) => element.tagName === "BUTTON" && element.textContent === "confirm-role-save"));

    const post = mocks.fetch.mock.calls.find(([url, init]) =>
      url === "/api/admin/access-control/staff-roles" && (init as RequestInit | undefined)?.method === "POST");
    expect(post).toBeDefined();
    expect(JSON.parse(String((post?.[1] as RequestInit).body))).toEqual({
      name: "Operations Reviewer",
      description: "Reviews vendors and KYC",
      permissionKeys: ["admin.kyc.review", "admin.vendor.manage"],
      reason: "Lecturer demonstration role",
    });
  });
});
