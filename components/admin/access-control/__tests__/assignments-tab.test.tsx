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

const mocks = vi.hoisted(() => ({
  fetch: vi.fn(),
  t: (key: string) => key,
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: mocks.t, i18n: { resolvedLanguage: "en" } }),
}));
vi.mock("lucide-react", () => ({
  ChevronLeft: (props: Record<string, unknown>) => <svg {...props} />,
  ChevronRight: (props: Record<string, unknown>) => <svg {...props} />,
  Plus: (props: Record<string, unknown>) => <svg {...props} />,
  RefreshCw: (props: Record<string, unknown>) => <svg {...props} />,
  Search: (props: Record<string, unknown>) => <svg {...props} />,
  ShieldCheck: (props: Record<string, unknown>) => <svg {...props} />,
  UserMinus: (props: Record<string, unknown>) => <svg {...props} />,
}));
vi.mock("@/components/ui/button", () => ({
  Button: (props: React.ComponentProps<"button">) => <button {...props} />,
}));
vi.mock("@/components/admin/confirm-dialog", () => ({
  AdminConfirmDialog: ({ open, onConfirm }: { open: boolean; onConfirm: () => void }) =>
    open ? <button data-testid="confirm-assignment" onClick={onConfirm}>confirm-assignment</button> : null,
}));

import { AssignmentsTab } from "@/components/admin/access-control/assignments-tab";

let createRoot: typeof import("react-dom/client").createRoot;
let root: ReturnType<typeof import("react-dom/client").createRoot> | undefined;
let document: TestDocument;
let container: TestElement;

function response(body: unknown, status = 200) {
  return { ok: status >= 200 && status < 300, status, json: async () => body } as Response;
}

async function click(element: TestElement) {
  await act(async () => {
    element.dispatchEvent(new TestEvent("click", { bubbles: true }));
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

function optionFor(select: TestElement, value: string) {
  return findOne(select, (element) => element.tagName === "OPTION" && element.value === value);
}

describe("AssignmentsTab capability eligibility", () => {
  beforeAll(async () => {
    document = installTestDom();
    ({ createRoot } = await import("react-dom/client"));
  });

  beforeEach(() => {
    mocks.fetch.mockReset();
    vi.stubGlobal("fetch", mocks.fetch);
    mocks.fetch.mockImplementation(async (url: string) => {
      if (url.startsWith("/api/admin/access-control/assignments?")) {
        return response({
          data: { items: [], page: 1, pageSize: 25, total: 0, totalPages: 0 },
          error: null,
        });
      }
      if (url === "/api/admin/access-control/capabilities?page=1&pageSize=100") {
        return response({
          data: {
            items: [
              { key: "recommendation.submit", category: "recommendation", riskLevel: "medium", customerVisible: true, manuallyAssignable: true, enabled: true },
              { key: "commerce.checkout", category: "commerce", riskLevel: "high", customerVisible: true, manuallyAssignable: true, enabled: true },
              { key: "affiliate.earn_commission", category: "affiliate", riskLevel: "high", customerVisible: true, manuallyAssignable: false, enabled: true },
              { key: "wallet.request_withdrawal", category: "wallet", riskLevel: "critical", customerVisible: true, manuallyAssignable: true, enabled: false },
            ],
            page: 1,
            pageSize: 100,
            total: 4,
            totalPages: 1,
          },
          error: null,
        });
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

  it("loads governed capability metadata and disables invalid manual allows", async () => {
    await act(async () => {
      root?.render(<AssignmentsTab focusId={null} onViewAudit={vi.fn()} />);
    });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 10));
      await Promise.resolve();
    });

    expect(mocks.fetch).toHaveBeenCalledWith(
      "/api/admin/access-control/capabilities?page=1&pageSize=100",
      { cache: "no-store" },
    );

    await click(findOne(container, (element) =>
      element.tagName === "BUTTON" && element.textContent.includes("accessControl.actions.newAssignment")));

    const selects = findElements(container, (element) => element.tagName === "SELECT");
    const capabilitySelect = findOne(container, (element) =>
      element.tagName === "SELECT"
      && findElements(element, (candidate) => candidate.tagName === "OPTION" && candidate.value === "affiliate.earn_commission").length === 1);
    const effectSelect = selects.find((select) =>
      findElements(select, (candidate) => candidate.tagName === "OPTION" && candidate.value === "deny").length === 1)!;

    expect(optionFor(capabilitySelect, "commerce.checkout").disabled).toBe(false);
    expect(optionFor(capabilitySelect, "affiliate.earn_commission").disabled).toBe(true);
    expect(optionFor(capabilitySelect, "affiliate.earn_commission").textContent)
      .toContain("accessControl.assignments.systemManagedOption");
    expect(optionFor(capabilitySelect, "wallet.request_withdrawal").disabled).toBe(true);
    expect(optionFor(capabilitySelect, "wallet.request_withdrawal").textContent)
      .toContain("accessControl.assignments.disabledOption");

    await selectValue(effectSelect, "deny");

    expect(optionFor(capabilitySelect, "affiliate.earn_commission").disabled).toBe(false);
    expect(optionFor(capabilitySelect, "wallet.request_withdrawal").disabled).toBe(true);
  });

  it("clears stale capability choices when the governed catalogue cannot be refreshed", async () => {
    let capabilityRequestCount = 0;
    mocks.fetch.mockImplementation(async (url: string) => {
      if (url.startsWith("/api/admin/access-control/assignments?")) {
        return response({
          data: { items: [], page: 1, pageSize: 25, total: 0, totalPages: 0 },
          error: null,
        });
      }
      if (url === "/api/admin/access-control/capabilities?page=1&pageSize=100") {
        capabilityRequestCount += 1;
        if (capabilityRequestCount > 1) {
          return response({ data: null, error: { message: "Capability catalogue unavailable" } }, 503);
        }
        return response({
          data: {
            items: [
              { key: "recommendation.submit", category: "recommendation", riskLevel: "medium", customerVisible: true, manuallyAssignable: true, enabled: true },
            ],
            page: 1,
            pageSize: 100,
            total: 1,
            totalPages: 1,
          },
          error: null,
        });
      }
      throw new Error(`Unexpected request: ${url}`);
    });

    await act(async () => {
      root?.render(<AssignmentsTab focusId={null} onViewAudit={vi.fn()} />);
    });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 10));
    });
    await click(findOne(container, (element) =>
      element.tagName === "BUTTON" && element.textContent.includes("accessControl.actions.newAssignment")));

    const subjectInput = findOne(container, (element) =>
      element.tagName === "INPUT" && element.getAttribute("placeholder") === "accessControl.assignments.subjectPlaceholder");
    const reasonInput = findOne(container, (element) => element.tagName === "TEXTAREA");
    await selectValue(subjectInput, "customer-user-id");
    await selectValue(reasonInput, "Temporary customer support exception");
    await click(findOne(container, (element) =>
      element.tagName === "BUTTON" && element.textContent.includes("accessControl.actions.reviewAssignment")));
    expect(container.textContent).toContain("confirm-assignment");

    const refreshButton = findOne(container, (element) =>
      element.tagName === "BUTTON" && element.textContent.trim() === "");
    await click(refreshButton);
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 10));
    });

    const capabilitySelect = findOne(container, (element) =>
      element.tagName === "SELECT"
      && element.textContent.includes("accessControl.assignments.selectCapability"));
    expect(capabilitySelect.disabled).toBe(true);
    expect(findElements(capabilitySelect, (element) =>
      element.tagName === "OPTION" && element.value === "recommendation.submit")).toHaveLength(0);
    expect(container.textContent).toContain("Capability catalogue unavailable");
    expect(container.textContent).not.toContain("confirm-assignment");
    expect(mocks.fetch.mock.calls.filter(([url, init]) =>
      url === "/api/admin/access-control/assignments" && init?.method === "POST")).toHaveLength(0);
  });

  it("ignores an older capability response that finishes after a newer failed refresh", async () => {
    let capabilityRequestCount = 0;
    let resolveOlderResponse: ((value: Response) => void) | undefined;
    mocks.fetch.mockImplementation(async (url: string) => {
      if (url.startsWith("/api/admin/access-control/assignments?")) {
        return response({
          data: { items: [], page: 1, pageSize: 25, total: 0, totalPages: 0 },
          error: null,
        });
      }
      if (url === "/api/admin/access-control/capabilities?page=1&pageSize=100") {
        capabilityRequestCount += 1;
        if (capabilityRequestCount === 1) {
          return response({
            data: {
              items: [
                { key: "recommendation.submit", category: "recommendation", riskLevel: "medium", customerVisible: true, manuallyAssignable: true, enabled: true },
              ],
              page: 1,
              pageSize: 100,
              total: 1,
              totalPages: 1,
            },
            error: null,
          });
        }
        if (capabilityRequestCount === 2) {
          return await new Promise<Response>((resolve) => { resolveOlderResponse = resolve; });
        }
        return response({ data: null, error: { message: "Latest catalogue unavailable" } }, 503);
      }
      throw new Error(`Unexpected request: ${url}`);
    });

    await act(async () => {
      root?.render(<AssignmentsTab focusId={null} onViewAudit={vi.fn()} />);
    });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 10));
    });

    const searchInput = findOne(container, (element) =>
      element.tagName === "INPUT" && element.getAttribute("placeholder") === "accessControl.filters.searchAssignments");
    await selectValue(searchInput, "first");
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 5));
    });
    await selectValue(searchInput, "second");
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 10));
    });

    await act(async () => {
      resolveOlderResponse?.(response({
        data: {
          items: [
            { key: "stale.capability", category: "stale", riskLevel: "low", customerVisible: true, manuallyAssignable: true, enabled: true },
          ],
          page: 1,
          pageSize: 100,
          total: 1,
          totalPages: 1,
        },
        error: null,
      }));
      await Promise.resolve();
      await Promise.resolve();
    });

    await click(findOne(container, (element) =>
      element.tagName === "BUTTON" && element.textContent.includes("accessControl.actions.newAssignment")));
    const capabilitySelect = findOne(container, (element) =>
      element.tagName === "SELECT"
      && element.textContent.includes("accessControl.assignments.selectCapability"));
    expect(capabilitySelect.disabled).toBe(true);
    expect(capabilitySelect.textContent).not.toContain("stale.capability");
    expect(container.textContent).toContain("Latest catalogue unavailable");
  });
});
