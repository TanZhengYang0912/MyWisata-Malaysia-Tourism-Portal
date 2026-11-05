import React, { act } from "react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { TestEvent, findOne, installTestDom, type TestDocument, type TestElement } from "@/components/shared/__tests__/render-test-dom";
const mocks = vi.hoisted(() => ({ fetch: vi.fn(), changed: vi.fn(), mutation: vi.fn(), t: (key: string) => key }));
vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: mocks.t }) }));
vi.mock("lucide-react", () => ({ ChevronLeft: () => <svg />, ChevronRight: () => <svg />, RefreshCw: () => <svg />, UserMinus: () => <svg /> }));
vi.mock("@/components/ui/button", () => ({ Button: (props: React.ComponentProps<"button">) => <button {...props} /> }));
vi.mock("@/components/admin/confirm-dialog", () => ({ AdminConfirmDialog: ({ open, description, onConfirm, onCancel }: { open: boolean; description: React.ReactNode; onConfirm: () => void; onCancel: () => void }) => open ? <section data-confirm="true">{description}<button onClick={onConfirm}>confirm-revoke</button><button onClick={onCancel}>cancel-revoke</button></section> : null }));
import { StaffEmployeesPanel } from "../staff-employees-panel";
const user = "11111111-1111-4111-8111-111111111111";
const role = "22222222-2222-4222-8222-222222222222";
const assignment = "33333333-3333-4333-8333-333333333333";
let document: TestDocument; let container: TestElement;
let createRoot: typeof import("react-dom/client").createRoot;
let root: ReturnType<typeof import("react-dom/client").createRoot>;
let revoked = false;
function response(data: unknown) { return { ok: true, json: async () => ({ data }) } as Response; }
const click = async (element: TestElement) => act(async () => { element.dispatchEvent(new TestEvent("click", { bubbles: true })); await new Promise((resolve) => setTimeout(resolve, 5)); });
function button(label: string) { return findOne(container, (element) => element.tagName === "BUTTON" && element.textContent === label); }
async function openPreview() {
  await act(async () => { root.render(<StaffEmployeesPanel generation={0} permissions={[{ id: "p", key: "admin.withdrawal.approve", module: "withdrawal", action: "approve", description: "Approve withdrawals" }]} onMutation={mocks.mutation} onChanged={mocks.changed} />); });
  await act(async () => { await new Promise((resolve) => setTimeout(resolve, 5)); });
  await click(button("accessControl.staffEmployees.viewAccess"));
  await click(button("accessControl.staffEmployees.revoke"));
  const input = findOne(container, (element) => element.tagName === "TEXTAREA");
  await act(async () => {
    Object.getOwnPropertyDescriptor(Object.getPrototypeOf(input), "value")?.set?.call(input, "Employee transferred to another team");
    input.dispatchEvent(new TestEvent("input", { bubbles: true }));
  });
  await click(button("accessControl.actions.reviewChange"));
}
describe("individual employee role revocation", () => {
  beforeAll(async () => { document = installTestDom(); ({ createRoot } = await import("react-dom/client")); });
  beforeEach(() => {
    revoked = false; vi.clearAllMocks(); mocks.changed.mockResolvedValue(undefined); vi.stubGlobal("fetch", mocks.fetch);
    mocks.fetch.mockImplementation(async (url: string, init?: RequestInit) => {
      if (init?.method === "DELETE") { revoked = true; return response({ assignmentId: assignment, auditEventId: "audit-1", generation: 3 }); }
      if (url.includes("staff-employees?")) return response({ items: [{ id: user, name: "Chen", email: "chen@example.test", status: "active", roles: ["staff", "approver"] }], total: 1, page: 1, pageSize: 25, totalPages: 1 });
      return response({ id: user, name: "Chen", email: "chen@example.test", status: "active", coarseRoles: ["staff", "approver"], assignments: revoked ? [] : [{ id: assignment, roleId: role, roleName: "Wallet team", isSystem: false, isActive: true, createdAt: null }], sources: [{ permissionKey: "admin.withdrawal.approve", sourceType: "legacy_role", sourceId: null, sourceName: "approver" }] });
    });
    container = document.createElement("div"); document.body.appendChild(container); root = createRoot(container as unknown as Element);
  });
  afterEach(() => { act(() => root.unmount()); document.body.removeChild(container); vi.unstubAllGlobals(); });
  it("shows the selected employee, role and remaining legacy source; cancellation never writes", async () => {
    await openPreview();
    const dialog = findOne(container, (element) => element.getAttribute("data-confirm") === "true");
    expect(dialog.textContent).toContain("Chen"); expect(dialog.textContent).toContain("Wallet team"); expect(dialog.textContent).toContain("roles.approver");
    await click(button("cancel-revoke"));
    expect(mocks.fetch.mock.calls.some(([, init]) => init?.method === "DELETE")).toBe(false);
  });
  it("revokes only the chosen assignment with a reason and refreshes authoritative remaining access", async () => {
    await openPreview(); await click(button("confirm-revoke"));
    const mutation = mocks.fetch.mock.calls.find(([, init]) => init?.method === "DELETE");
    expect(mutation?.[0]).toBe(`/api/admin/access-control/staff-roles/${role}/assignments`);
    expect(JSON.parse(mutation?.[1].body)).toEqual({ assignmentId: assignment, reason: "Employee transferred to another team" });
    expect(mocks.changed).toHaveBeenCalledTimes(1);
    expect(mocks.mutation).toHaveBeenCalledWith(expect.objectContaining({ assignmentId: assignment, auditEventId: "audit-1" }), "accessControl.staffEmployees.revoked");
    expect(container.textContent).toContain("roles.approver");
  });
});
