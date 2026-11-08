import React, { act } from "react";
import { afterEach, beforeAll, beforeEach, expect, it, vi } from "vitest";
import { findElements, installTestDom, type TestDocument, type TestElement } from "@/components/shared/__tests__/render-test-dom";

const mocks = vi.hoisted(() => ({ role: "super_admin" as string, slug: "event-lifecycle", hrefs: [] as string[] }));

vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock("next/link", () => ({ default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => <a href={href} {...rest}>{children}</a> }));
vi.mock("next/navigation", () => ({ useParams: () => ({ slug: mocks.slug }) }));
vi.mock("@/components/providers/auth", () => ({ useAuth: () => ({ currentUser: { id: "staff-1", role: mocks.role }, staffModules: [] }) }));
vi.mock("@/lib/staff-permissions/navigation", () => ({
  staffNavigationSections: () => [{ key: "governance", label: "Governance", labelKey: null, items: mocks.hrefs.map((href) => ({ href })) }],
}));

import AdminHelpWorkflowPage from "@/app/admin/help/flows/[slug]/page";

let document: TestDocument, container: TestElement, root: ReturnType<typeof import("react-dom/client").createRoot>;
let createRoot: typeof import("react-dom/client").createRoot;
beforeAll(async () => { document = installTestDom(); ({ createRoot } = await import("react-dom/client")); });
beforeEach(() => { container = document.createElement("div"); document.body.appendChild(container); root = createRoot(container as unknown as Element); });
afterEach(() => { act(() => root.unmount()); document.body.removeChild(container); });

async function render(role: string, slug: string, hrefs: string[] = []) {
  Object.assign(mocks, { role, slug, hrefs });
  await act(async () => { root.render(<AdminHelpWorkflowPage />); });
}

const stepLinks = () => findElements(container, (element) => element.tagName === "A")
  .map((element) => element.getAttribute("href"))
  .filter((href) => href?.startsWith("/admin/help/") && href !== "/admin/help");

it("lists every step in order with links for a Super Admin", async () => {
  await render("super_admin", "event-lifecycle");
  expect(container.textContent).toContain("Event lifecycle");
  expect(stepLinks()).toEqual([
    "/admin/help/event-campaigns",
    "/admin/help/event-registrations",
    "/admin/help/orders",
    "/admin/help/refund-review",
    "/admin/help/event-exceptions",
    "/admin/help/reconciliation",
  ]);
  expect(container.textContent).toContain("Event Stalls");
});

it("shows steps outside the staff member's menu without links", async () => {
  await render("approver", "event-lifecycle", ["/admin/orders"]);
  expect(stepLinks()).toEqual(["/admin/help/orders"]);
  expect(container.textContent).toContain("Order Breakdown");
});

it("hides a workflow none of whose pages the staff member can open", async () => {
  await render("approver", "event-lifecycle", ["/admin/withdrawals"]);
  expect(container.textContent).toContain("staffHelp.workflowNotAvailable");
});
