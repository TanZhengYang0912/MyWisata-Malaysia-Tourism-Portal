import React, { act } from "react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { findOne, installTestDom, TestEvent, type TestDocument, type TestElement } from "@/components/shared/__tests__/render-test-dom";

const mocks = vi.hoisted(() => ({ fetch: vi.fn(), t: (key: string) => key }));
vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: mocks.t }) }));
vi.mock("lucide-react", () => ({ AlertTriangle: () => <svg />, ArrowRight: () => <svg />, RefreshCw: () => <svg /> }));
vi.mock("@/components/ui/button", () => ({ Button: (props: React.ComponentProps<"button">) => <button {...props} /> }));
vi.mock("@/components/admin/admin-page-shell", () => ({ AdminMetricGrid: ({ items }: { items: Array<{ value: number }> }) => <output>{items.map(item => item.value).join(",")}</output> }));

import { OverviewTab } from "../overview-tab";

let document: TestDocument;
let container: TestElement;
let createRoot: typeof import("react-dom/client").createRoot;
let root: ReturnType<typeof createRoot>;
const overview = { generation: 7, counts: { capabilities: 2, policies: 1, activeVersions: 1, pendingApprovals: 0, activeAssignments: 3, expiringAssignments: 0 }, warnings: [] };
const response = (status: number, data: unknown, message = "Denied") => ({ ok: status === 200, status, json: async () => ({ data, error: status === 200 ? null : { message } }) }) as Response;

async function mount() {
  await act(async () => { root.render(<OverviewTab onOpenTab={vi.fn()} />); });
  await act(async () => { await vi.advanceTimersByTimeAsync(0); });
}

describe("Access Control overview request lifecycle", () => {
  beforeAll(async () => { document = installTestDom(); ({ createRoot } = await import("react-dom/client")); });
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    vi.stubGlobal("fetch", mocks.fetch);
    container = document.createElement("div"); document.body.appendChild(container);
    root = createRoot(container as unknown as HTMLElement);
  });
  afterEach(async () => {
    await act(async () => { root.unmount(); });
    document.body.removeChild(container); vi.useRealTimers(); vi.unstubAllGlobals();
  });

  it.each([401, 403, 503])("shows a settled %i failure and retries successfully", async status => {
    mocks.fetch.mockResolvedValueOnce(response(status, null)).mockResolvedValueOnce(response(200, overview));
    await mount();
    expect(container.textContent).toContain("Denied");
    expect(container.textContent).not.toContain("accessControl.states.loading");
    await act(async () => { findOne(container, element => element.tagName === "BUTTON").dispatchEvent(new TestEvent("click", { bubbles: true })); });
    expect(container.textContent).toContain("1,0,3,7");
    expect(mocks.fetch).toHaveBeenCalledTimes(2);
  });

  it("exits loading after an unresponsive request and allows retry", async () => {
    mocks.fetch.mockImplementationOnce((_url: string, init: RequestInit) => new Promise((_resolve, reject) => {
      init.signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")));
    })).mockResolvedValueOnce(response(200, overview));
    await mount();
    await act(async () => { await vi.advanceTimersByTimeAsync(15_000); });
    expect(container.textContent).not.toContain("accessControl.states.loading");
    expect(container.textContent).toContain("accessControl.errors.load");
    await act(async () => { findOne(container, element => element.tagName === "BUTTON").dispatchEvent(new TestEvent("click", { bubbles: true })); });
    expect(container.textContent).toContain("1,0,3,7");
  });

  it("cancels an in-flight request when the overview unmounts", async () => {
    mocks.fetch.mockImplementation(() => new Promise(() => undefined));
    await mount();
    const signal = mocks.fetch.mock.calls[0][1].signal as AbortSignal;
    await act(async () => { root.render(null); });
    expect(signal.aborted).toBe(true);
  });
});
