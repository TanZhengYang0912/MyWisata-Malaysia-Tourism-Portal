import React, { act } from "react";
import { afterEach, beforeAll, beforeEach, expect, it, vi } from "vitest";
import { findElements, findOne, installTestDom, TestEvent, type TestDocument, type TestElement } from "@/components/shared/__tests__/render-test-dom";

const DEFAULT_MENU: Array<[string, string, string[]]> = [
  ["governance", "Governance", ["/admin/promotion-campaigns", "/admin/event-promotions"]],
  ["finance", "Finance", ["/admin/withdrawals", "/admin/refunds"]],
];

const mocks = vi.hoisted(() => ({
  role: "super_admin" as string,
  // Sidebar sections as staffNavigationSections returns them: [key, label, hrefs].
  menu: [] as Array<[string, string, string[]]>,
}));

vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock("next/link", () => ({ default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => <a href={href} {...rest}>{children}</a> }));
vi.mock("@/components/providers/auth", () => ({ useAuth: () => ({ currentUser: { id: "staff-1", role: mocks.role }, staffModules: [] }) }));
vi.mock("@/lib/staff-permissions/navigation", () => ({
  staffNavigationSections: () => mocks.menu.map(([key, label, hrefs]) => ({ key, label, labelKey: null, items: hrefs.map((href) => ({ href })) })),
}));

import AdminHelpPage from "@/app/admin/help/page";

let document: TestDocument, container: TestElement, root: ReturnType<typeof import("react-dom/client").createRoot>;
let createRoot: typeof import("react-dom/client").createRoot;
beforeAll(async () => { document = installTestDom(); ({ createRoot } = await import("react-dom/client")); });
beforeEach(() => {
  mocks.role = "super_admin";
  mocks.menu = DEFAULT_MENU;
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container as unknown as Element);
});
afterEach(() => { act(() => root.unmount()); document.body.removeChild(container); });

const attr = (scope: TestElement, name: string) => findElements(scope, (element) => element.getAttribute(name) !== null).map((element) => element.getAttribute(name));
const sectionNames = () => attr(container, "data-staff-help-section");

async function search(text: string) {
  const input = findOne(container, (element) => element.tagName === "INPUT");
  await act(async () => {
    Object.getOwnPropertyDescriptor(Object.getPrototypeOf(input), "value")?.set?.call(input, text);
    input.dispatchEvent(new TestEvent("input", { bubbles: true }));
  });
}

it("groups Super Admin sections under the sidebar headings, with the rest under Other", async () => {
  await act(async () => { root.render(<AdminHelpPage />); });
  expect(attr(container, "data-staff-help-group")).toEqual(["governance", "finance", "other"]);
  const governance = findOne(container, (element) => element.getAttribute("data-staff-help-group") === "governance");
  expect(attr(governance, "data-staff-help-section")).toEqual(["event_campaigns", "event_promotions"]);
  expect(sectionNames()).toEqual(expect.arrayContaining(["withdrawals", "refund_review", "user_management", "staff_sign_in_security"]));
});

it("links each section card to its own guide page", async () => {
  await act(async () => { root.render(<AdminHelpPage />); });
  const card = findOne(container, (element) => element.getAttribute("data-staff-help-section") === "event_registrations");
  expect(card.getAttribute("href")).toBe("/admin/help/event-registrations");
});

it("shows other staff only the sections in their own menu, plus sign-in security", async () => {
  mocks.role = "approver";
  mocks.menu = [["finance", "Finance", ["/admin/withdrawals"]]];
  await act(async () => { root.render(<AdminHelpPage />); });
  expect(sectionNames()).toEqual(["withdrawals", "staff_sign_in_security"]);
  expect(attr(container, "data-staff-help-group")).toEqual(["finance", "other"]);
  expect(container.textContent).toContain("staffHelp.permissionNote");
});

it("never renders the registry's internal source paths", async () => {
  await act(async () => { root.render(<AdminHelpPage />); });
  expect(container.textContent).not.toContain("route.ts");
  expect(container.textContent).not.toContain("supabase/migrations");
});

it("filters sections by the search text and keeps their headings", async () => {
  await act(async () => { root.render(<AdminHelpPage />); });
  await search("booth number");
  expect(sectionNames()).toContain("event_registrations");
  expect(sectionNames()).not.toContain("withdrawals");
  await search("no section mentions this phrase");
  expect(sectionNames()).toEqual([]);
  expect(container.textContent).toContain("staffHelp.empty");
});

it("labels each section's audience from the viewer's point of view", async () => {
  const badge = (name: string) => findOne(container, (element) => element.getAttribute("data-staff-help-section") === name).textContent;
  await act(async () => { root.render(<AdminHelpPage />); });
  expect(badge("event_campaigns")).toContain("staffHelp.whoSuperAdmin");
  expect(badge("withdrawals")).toContain("staffHelp.whoStaff");

  mocks.role = "approver";
  await act(async () => { root.render(<AdminHelpPage />); });
  // Campaigns is in this approver's menu, so it was granted through their staff role.
  expect(badge("event_campaigns")).toContain("staffHelp.whoGranted");
  expect(badge("event_campaigns")).not.toContain("staffHelp.whoSuperAdmin");
  expect(badge("withdrawals")).toContain("staffHelp.whoStaff");
});

it("lists workflows above the guides, only when one of their pages is visible, and hides them while searching", async () => {
  await act(async () => { root.render(<AdminHelpPage />); });
  expect(attr(container, "data-staff-help-workflow")).toEqual(["event-lifecycle"]);
  expect(findElements(container, (element) => element.getAttribute("data-staff-help-workflow") === "event-lifecycle")[0]?.getAttribute("href")).toBe("/admin/help/flows/event-lifecycle");
  await search("booth number");
  expect(attr(container, "data-staff-help-workflow")).toEqual([]);
});

it("does not list a workflow to staff who can open none of its pages", async () => {
  mocks.role = "approver";
  mocks.menu = [["finance", "Finance", ["/admin/withdrawals"]]];
  await act(async () => { root.render(<AdminHelpPage />); });
  expect(attr(container, "data-staff-help-workflow")).toEqual([]);
});
