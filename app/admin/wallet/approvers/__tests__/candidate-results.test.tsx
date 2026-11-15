import { act, createElement } from "react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { findElements, findOne, installTestDom, TestElement, TestEvent, type TestDocument } from "@/components/shared/__tests__/render-test-dom";

const mocks = vi.hoisted(() => ({
  fetch: vi.fn(),
  showFeedback: vi.fn(),
  t: (key: string, options?: Record<string, unknown>) => key === "pagination.range"
    ? `${options?.from}–${options?.to} of ${options?.total} results`
    : key,
}));

vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: mocks.t, i18n: { resolvedLanguage: "en" } }) }));
vi.mock("@/components/providers/action-feedback", () => ({ useActionFeedback: () => ({ showFeedback: mocks.showFeedback }) }));
vi.mock("@/components/admin/confirm-dialog", () => ({
  AdminConfirmDialog: ({ open, onConfirm }: { open: boolean; onConfirm: () => void }) => open
    ? createElement("button", { onClick: onConfirm, "data-confirm-role-change": "true" }, "Confirm role change")
    : null,
}));

import WalletApproversPage from "../page";
import { resolveCandidatePageAfterRefresh } from "../candidate-page";

let document: TestDocument;
let createRoot: typeof import("react-dom/client").createRoot;
let container: TestElement;
let root: ReturnType<typeof createRoot>;

beforeAll(async () => {
  document = installTestDom();
  ({ createRoot } = await import("react-dom/client"));
});

beforeEach(() => {
  mocks.fetch.mockReset().mockImplementation((input: string) => {
    const params = new URL(input, "http://localhost").searchParams;
    const page = params.get("page");
    const search = params.get("search");
    const eligibleUsers = search
      ? [{ id: "user-99", email: "aisyah@example.test", name: "Aisyah Rahman" }]
      : Array.from({ length: 10 }, (_, index) => {
        const candidateNumber = (page === "2" ? 10 : 0) + index + 1;
        return { id: `user-${candidateNumber}`, email: `user${candidateNumber}@example.test`, name: `Candidate ${candidateNumber}` };
      });
    return Promise.resolve({
      ok: true,
      json: async () => ({ data: { items: [], eligibleUsers, total: search ? 1 : 20 } }),
    });
  });
  mocks.showFeedback.mockReset();
  vi.stubGlobal("fetch", mocks.fetch);
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container as unknown as Element);
});

afterEach(() => {
  act(() => root.unmount());
  document.body.removeChild(container);
  vi.unstubAllGlobals();
});

async function renderPage() {
  await act(async () => {
    root.render(createElement(WalletApproversPage));
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

describe("wallet approver candidate results", () => {
  it("clamps an emptied final page to the last page that still contains candidates", () => {
    expect(resolveCandidatePageAfterRefresh(2, 10, 10, 0)).toBe(1);
    expect(resolveCandidatePageAfterRefresh(2, 10, 11, 1)).toBe(2);
  });

  it("shows selectable candidates with their pager and loads a different candidate on the next page", async () => {
    await renderPage();

    const results = findOne(container, (element) => element.getAttribute("data-candidate-results") === "true");
    expect(results.textContent).toContain("Candidate 1");
    expect(findElements(results, (element) => element.tagName === "INPUT" && element.type === "radio")).toHaveLength(10);
    expect(findElements(results, (element) => element.tagName === "NAV" && element.getAttribute("data-slot") === "pagination")).toHaveLength(1);

    const nextPage = findOne(results, (element) => element.tagName === "BUTTON" && element.getAttribute("aria-label") === "accessibility.nextPage");
    await act(async () => {
      nextPage.click();
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(mocks.fetch).toHaveBeenLastCalledWith(expect.stringContaining("page=2"), expect.objectContaining({ cache: "no-store" }));
    expect(results.textContent).toContain("Candidate 11");
    expect(results.textContent).not.toContain("user1@example.test");

    const pageSize = findOne(container, (element) => element.tagName === "SELECT" && element.options.length === 3);
    await act(async () => {
      Object.getOwnPropertyDescriptor(TestElement.prototype, "value")?.set?.call(pageSize, "25");
      pageSize.dispatchEvent(new TestEvent("change", { bubbles: true }));
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(mocks.fetch).toHaveBeenLastCalledWith(expect.stringContaining("page=1&pageSize=25"), expect.objectContaining({ cache: "no-store" }));

    const search = findOne(container, (element) => element.tagName === "INPUT" && element.getAttribute("placeholder") === "ui.walletApprovers.searchCandidates");
    await act(async () => {
      Object.getOwnPropertyDescriptor(TestElement.prototype, "value")?.set?.call(search, "Aisyah");
      search.dispatchEvent(new TestEvent("input", { bubbles: true }));
      await new Promise((resolve) => setTimeout(resolve, 300));
    });
    expect(mocks.fetch).toHaveBeenLastCalledWith(expect.stringContaining("page=1&pageSize=25&search=Aisyah"), expect.objectContaining({ cache: "no-store" }));
    expect(results.textContent).toContain("Aisyah Rahman");
    expect(results.textContent).toContain("1–1 of 1 results");
  });

  it("ignores an older search response when a newer search has completed", async () => {
    await renderPage();

    const requests: { url: string; resolve: (response: { ok: boolean; json: () => Promise<unknown> }) => void }[] = [];
    mocks.fetch.mockImplementation((input: string) => new Promise((resolve) => {
      requests.push({ url: input, resolve });
    }));
    const search = findOne(container, (element) => element.tagName === "INPUT" && element.getAttribute("placeholder") === "ui.walletApprovers.searchCandidates");
    const results = findOne(container, (element) => element.getAttribute("data-candidate-results") === "true");
    const enterSearch = async (value: string) => {
      await act(async () => {
        Object.getOwnPropertyDescriptor(TestElement.prototype, "value")?.set?.call(search, value);
        search.dispatchEvent(new TestEvent("input", { bubbles: true }));
        await new Promise((resolve) => setTimeout(resolve, 300));
      });
    };
    const respond = async (index: number, name: string) => {
      await act(async () => {
        requests[index]?.resolve({
          ok: true,
          json: async () => ({ data: { items: [], eligibleUsers: [{ id: name, name, email: `${name.toLowerCase()}@example.test` }], total: 1 } }),
        });
        await new Promise((resolve) => setTimeout(resolve, 0));
      });
    };

    await enterSearch("Aisyah");
    await enterSearch("Sarah");
    expect(requests.map(({ url }) => new URL(url, "http://localhost").searchParams.get("search"))).toEqual(["Aisyah", "Sarah"]);

    await respond(1, "Sarah");
    await respond(0, "Aisyah");

    expect(results.textContent).toContain("Sarah");
    expect(results.textContent).not.toContain("Aisyah");
  });

  it("returns to the last valid page after granting the only candidate on the final page", async () => {
    let candidateGranted = false;
    mocks.fetch.mockImplementation((input: string, init?: RequestInit) => {
      if (init?.method === "PATCH") {
        candidateGranted = true;
        return Promise.resolve({ ok: true, json: async () => ({ data: {} }) });
      }
      const page = new URL(input, "http://localhost").searchParams.get("page");
      const eligibleUsers = page === "2" && candidateGranted
        ? []
        : page === "2"
          ? [{ id: "user-11", name: "Candidate 11", email: "user11@example.test" }]
          : Array.from({ length: 10 }, (_, index) => ({ id: `user-${index + 1}`, name: `Candidate ${index + 1}`, email: `user${index + 1}@example.test` }));
      return Promise.resolve({
        ok: true,
        json: async () => ({ data: { items: [], eligibleUsers, total: candidateGranted ? 10 : 11 } }),
      });
    });
    await renderPage();

    const results = findOne(container, (element) => element.getAttribute("data-candidate-results") === "true");
    const nextPage = findOne(results, (element) => element.tagName === "BUTTON" && element.getAttribute("aria-label") === "accessibility.nextPage");
    await act(async () => {
      nextPage.click();
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    const candidate = findOne(results, (element) => element.tagName === "INPUT" && element.type === "radio");
    const reason = findOne(container, (element) => element.tagName === "TEXTAREA");
    await act(async () => {
      (candidate as TestElement & { checked: boolean }).checked = true;
      candidate.click();
      candidate.dispatchEvent(new TestEvent("change", { bubbles: true }));
      Object.getOwnPropertyDescriptor(TestElement.prototype, "value")?.set?.call(reason, "Operational coverage change");
      reason.dispatchEvent(new TestEvent("input", { bubbles: true }));
    });
    const grant = findOne(container, (element) => element.tagName === "BUTTON" && element.textContent.includes("ui.walletApprovers.grant"));
    await act(async () => grant.click());
    const confirm = findOne(container, (element) => element.getAttribute("data-confirm-role-change") === "true");
    await act(async () => {
      confirm.click();
      await new Promise((resolve) => setTimeout(resolve, 0));
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(candidateGranted).toBe(true);
    expect(mocks.fetch.mock.calls.some(([url]) => typeof url === "string" && url.includes("page=1"))).toBe(true);
    expect(results.textContent).toContain("Candidate 1");
    expect(results.textContent).toContain("1–10 of 10 results");
  });
});
