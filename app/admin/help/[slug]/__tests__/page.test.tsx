import React, { act } from "react";
import { afterEach, beforeAll, beforeEach, expect, it, vi } from "vitest";
import { findElements, installTestDom, type TestDocument, type TestElement } from "@/components/shared/__tests__/render-test-dom";

const mocks = vi.hoisted(() => ({ role: "super_admin" as string, slug: "event-campaigns", hrefs: [] as string[] }));

vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock("next/link", () => ({ default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => <a href={href} {...rest}>{children}</a> }));
vi.mock("next/navigation", () => ({ useParams: () => ({ slug: mocks.slug }) }));
vi.mock("@/components/providers/auth", () => ({ useAuth: () => ({ currentUser: { id: "staff-1", role: mocks.role }, staffModules: [] }) }));
vi.mock("@/lib/staff-permissions/navigation", () => ({
  staffNavigationSections: () => [{ key: "finance", label: "Finance", labelKey: null, items: mocks.hrefs.map((href) => ({ href })) }],
}));

import AdminHelpGuidePage from "@/app/admin/help/[slug]/page";

let document: TestDocument, container: TestElement, root: ReturnType<typeof import("react-dom/client").createRoot>;
let createRoot: typeof import("react-dom/client").createRoot;
beforeAll(async () => { document = installTestDom(); ({ createRoot } = await import("react-dom/client")); });
beforeEach(() => { container = document.createElement("div"); document.body.appendChild(container); root = createRoot(container as unknown as Element); });
afterEach(() => { act(() => root.unmount()); document.body.removeChild(container); });

async function render(role: string, slug: string, hrefs: string[] = []) {
  Object.assign(mocks, { role, slug, hrefs });
  await act(async () => { root.render(<AdminHelpGuidePage />); });
}

it("shows the full guide with its page link, actions and rules", async () => {
  await render("super_admin", "event-registrations");
  expect(container.textContent).toContain("Event Stalls");
  expect(container.textContent).toContain("Approve a pending registration by confirming a booth number");
  expect(container.textContent).toContain("staffHelp.notes");
  const hrefs = findElements(container, (element) => element.tagName === "A").map((element) => element.getAttribute("href"));
  expect(hrefs).toEqual(expect.arrayContaining(["/admin/event-registrations", "/admin/help"]));
  expect(container.textContent).not.toContain("route.ts");
});

it("shows a guide to other staff when its page is in their menu", async () => {
  await render("approver", "withdrawals", ["/admin/withdrawals"]);
  expect(container.textContent).toContain("Approve a withdrawal");
});

it("does not show a guide for a page outside the staff member's menu", async () => {
  await render("approver", "refund-review", ["/admin/withdrawals"]);
  expect(container.textContent).toContain("staffHelp.notAvailable");
  expect(container.textContent).not.toContain("Approve or reject a pending refund");
});

it("handles an unknown guide address", async () => {
  await render("super_admin", "no-such-guide");
  expect(container.textContent).toContain("staffHelp.notAvailable");
});

it("tells a staff member a Super Admin section was granted to their account", async () => {
  await render("approver", "event-campaigns", ["/admin/promotion-campaigns"]);
  expect(container.textContent).toContain("staffHelp.whoGranted");
  expect(container.textContent).not.toContain("staffHelp.whoSuperAdmin");
});

it("shows the status lifecycle in order on a page that runs a whole activity", async () => {
  await render("super_admin", "withdrawals");
  const lifecycle = findElements(container, (element) => element.getAttribute("data-staff-help-lifecycle") !== null)[0];
  expect(lifecycle?.textContent).toContain("staffHelp.lifecycle");
  const text = lifecycle?.textContent ?? "";
  expect(text.indexOf("Pending second approval")).toBeGreaterThan(text.indexOf("Pending"));
  expect(text).toContain("Rejected");
});

it("links a guide to its workflow and the neighbouring steps", async () => {
  await render("super_admin", "event-registrations");
  const partOf = findElements(container, (element) => element.getAttribute("data-staff-help-part-of") === "event-lifecycle")[0];
  expect(partOf?.textContent).toContain("staffHelp.partOf");
  const hrefs = findElements(partOf!, (element) => element.tagName === "A").map((element) => element.getAttribute("href"));
  expect(hrefs).toEqual(["/admin/help/flows/event-lifecycle", "/admin/help/event-campaigns", "/admin/help/orders"]);
});

it("does not link a neighbouring step the staff member cannot open", async () => {
  await render("approver", "event-registrations", ["/admin/event-registrations"]);
  const partOf = findElements(container, (element) => element.getAttribute("data-staff-help-part-of") === "event-lifecycle")[0];
  const hrefs = findElements(partOf!, (element) => element.tagName === "A").map((element) => element.getAttribute("href"));
  expect(hrefs).toEqual(["/admin/help/flows/event-lifecycle"]);
});
