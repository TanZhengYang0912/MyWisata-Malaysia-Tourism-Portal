import React, { act } from "react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { TestEvent, findOne, installTestDom, type TestDocument, type TestElement } from "@/components/shared/__tests__/render-test-dom";

vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock("@/components/providers/auth", () => ({ useAuth: () => ({ currentUser: { id: "admin-test" } }) }));
vi.mock("lucide-react", () => ({ CheckCircle2: () => <svg />, SearchCheck: () => <svg /> }));
vi.mock("@/components/ui/button", () => ({ Button: (props: React.ComponentProps<"button">) => <button {...props} /> }));
vi.mock("@/components/admin/segmented-filter", () => ({
  AdminSegmentedFilter: ({ items, onChange }: { items: Array<{ value: string; label: string }>; onChange: (value: string) => void }) => <nav>{items.map((item) => <button key={item.value} onClick={() => onChange(item.value)}>{item.value}</button>)}</nav>,
}));
vi.mock("../overview-tab", () => ({ OverviewTab: () => <div>overview panel</div> }));
vi.mock("../capabilities-tab", () => ({ CapabilitiesTab: () => <div>capability panel</div> }));
vi.mock("../policies-tab", () => ({ PoliciesTab: () => <div>policy panel</div> }));
vi.mock("../assignments-tab", () => ({ AssignmentsTab: () => <div>assignment panel</div> }));
vi.mock("../audit-log-tab", () => ({ AuditLogTab: ({ focus }: { focus: { eventId?: string; entityId?: string | null; actionPrefix?: string } | null }) => <div data-audit-focus={JSON.stringify(focus)}>audit panel</div> }));
vi.mock("../staff-roles-tab", () => ({ StaffRolesTab: ({ onMutation }: { onMutation: (receipt: object, message: string) => void }) => <button onClick={() => onMutation({ committed: true, receiptAvailable: false, entityId: "invite-id", action: "staff.invitation.created" }, "invitation created")}>record mutation</button> }));

import { AccessControlTabs } from "../access-control-tabs";

let document: TestDocument;
let container: TestElement;
let createRoot: typeof import("react-dom/client").createRoot;
let root: ReturnType<typeof createRoot>;
const sessionValues = new Map<string, string>();

async function click(element: TestElement) {
  await act(async () => {
    element.dispatchEvent(new TestEvent("click", { bubbles: true }));
    await Promise.resolve();
  });
}

describe("AccessControlTabs mutation receipt", () => {
  beforeAll(async () => {
    document = installTestDom();
    ({ createRoot } = await import("react-dom/client"));
  });
  beforeEach(() => {
    sessionValues.clear();
    vi.stubGlobal("sessionStorage", {
      getItem: (key: string) => sessionValues.get(key) ?? null,
      setItem: (key: string, value: string) => sessionValues.set(key, value),
      removeItem: (key: string) => sessionValues.delete(key),
    });
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container as unknown as HTMLElement);
    act(() => root.render(<AccessControlTabs />));
  });
  afterEach(() => {
    act(() => root.unmount());
    document.body.removeChild(container);
    vi.unstubAllGlobals();
  });

  it("keeps a committed receipt across tabs and filters audit by exact entity and action when event lookup is unavailable", async () => {
    await click(findOne(container, (element) => element.tagName === "BUTTON" && element.textContent === "staff-roles"));
    await click(findOne(container, (element) => element.tagName === "BUTTON" && element.textContent === "record mutation"));
    expect(container.textContent).toContain("accessControl.feedback.committedReceiptUnavailable");

    await click(findOne(container, (element) => element.tagName === "BUTTON" && element.textContent === "audit-log"));
    expect(container.textContent).toContain("accessControl.feedback.committedReceiptUnavailable");
    await click(findOne(container, (element) => element.tagName === "BUTTON" && element.textContent.includes("accessControl.actions.viewAuditEvent")));

    const auditPanel = findOne(container, (element) => element.getAttribute("data-audit-focus") !== null);
    expect(JSON.parse(auditPanel.getAttribute("data-audit-focus") ?? "null")).toEqual({
      entityId: "invite-id",
      actionPrefix: "staff.invitation.created",
    });
  });

  it("restores only the safe receipt fields after a same-user page remount", async () => {
    await click(findOne(container, (element) => element.tagName === "BUTTON" && element.textContent === "staff-roles"));
    await click(findOne(container, (element) => element.tagName === "BUTTON" && element.textContent === "record mutation"));
    const stored = JSON.parse(sessionValues.get("access-control.mutation-receipt.v1:admin-test") ?? "null") as Record<string, unknown>;
    expect(stored).toEqual({
      committed: true,
      entityId: "invite-id",
      action: "staff.invitation.created",
      auditEventId: null,
      receiptAvailable: false,
      generation: null,
    });
    expect(JSON.stringify(stored)).not.toContain("invitation created");

    act(() => root.unmount());
    root = createRoot(container as unknown as HTMLElement);
    act(() => root.render(<AccessControlTabs />));
    expect(container.textContent).toContain("accessControl.feedback.committedReceiptUnavailable");
    await click(findOne(container, (element) => element.tagName === "BUTTON" && element.textContent.includes("accessControl.actions.viewAuditEvent")));

    const auditPanel = findOne(container, (element) => element.getAttribute("data-audit-focus") !== null);
    expect(JSON.parse(auditPanel.getAttribute("data-audit-focus") ?? "null")).toEqual({
      entityId: "invite-id",
      actionPrefix: "staff.invitation.created",
    });
  });
});
