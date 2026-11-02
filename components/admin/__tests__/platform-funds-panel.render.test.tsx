import { act, type ReactNode } from "react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { findElements, findOne, installTestDom, TestElement, TestEvent, type TestDocument } from "@/components/shared/__tests__/render-test-dom";

const mocks = vi.hoisted(() => ({ fetch: vi.fn(), confirm: vi.fn(), prompt: vi.fn() }));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string, values?: Record<string, unknown>) => values ? `${key}:${JSON.stringify(values)}` : key, i18n: { resolvedLanguage: "en" } }),
}));
vi.mock("@/components/providers/app-dialog", () => ({ useAppDialog: () => ({ confirm: mocks.confirm, prompt: mocks.prompt }) }));
vi.mock("@/components/ui/dialog", () => {
  const Pass = ({ children }: { children?: ReactNode }) => <div>{children}</div>;
  return { Dialog: ({ open, children }: { open: boolean; children?: ReactNode }) => open ? <div data-dialog>{children}</div> : null, DialogContent: Pass, DialogDescription: Pass, DialogFooter: Pass, DialogHeader: Pass, DialogTitle: Pass };
});

import { PlatformFundsPanel, parseRinggitToSen, type PlatformFunds } from "../platform-funds-panel";

let document: TestDocument;
let createRoot: typeof import("react-dom/client").createRoot;
let container: TestElement;
let root: ReturnType<typeof createRoot>;

const funds = (availableSen: number, transfers: PlatformFunds["transfers"] = []): PlatformFunds => ({
  owed: { readyToWithdrawSen: 3863003, onHoldSen: 0, withdrawalsInProgressSen: 0, customerTopUpSen: 99500, refundsPendingSen: 0, totalSen: 3962503 },
  earnedConfirmedSen: availableSen, transferredSen: 0, availableSen, transfers,
});
const ok = (data: unknown) => ({ ok: true, json: async () => ({ data }) }) as Response;

beforeAll(async () => {
  document = installTestDom();
  ({ createRoot } = await import("react-dom/client"));
});

beforeEach(() => {
  mocks.fetch.mockReset(); mocks.confirm.mockReset().mockResolvedValue(true); mocks.prompt.mockReset();
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

async function render(data: PlatformFunds) {
  mocks.fetch.mockResolvedValue(ok(data));
  await act(async () => { root.render(<PlatformFundsPanel />); await new Promise((resolve) => setTimeout(resolve, 0)); });
}
const button = (key: string) => findOne(container, (element) => element.tagName === "BUTTON" && element.textContent.includes(key));
async function click(element: TestElement) {
  await act(async () => { element.dispatchEvent(new TestEvent("click", { bubbles: true })); await new Promise((resolve) => setTimeout(resolve, 0)); });
}
async function type(index: number, value: string) {
  const input = findElements(container, (element) => element.tagName === "INPUT")[index];
  await act(async () => {
    Object.getOwnPropertyDescriptor(TestElement.prototype, "value")?.set?.call(input, value);
    input.dispatchEvent(new TestEvent("input", { bubbles: true }));
  });
}
const posts = () => mocks.fetch.mock.calls.filter(([, init]) => (init as RequestInit | undefined)?.method === "POST").map(([, init]) => JSON.parse(String((init as RequestInit).body)));

describe("parseRinggitToSen", () => {
  it("converts ringgit with up to two decimals and rejects everything else", () => {
    expect(parseRinggitToSen("1,250.50")).toBe(125050);
    expect(parseRinggitToSen("0.01")).toBe(1);
    expect(parseRinggitToSen("12")).toBe(1200);
    for (const bad of ["", "0", "0.00", "-5", "1.234", "abc", "1e3"]) expect(parseRinggitToSen(bad)).toBeNull();
  });
});

describe("PlatformFundsPanel", () => {
  it("shows what is still owed and disables recording when nothing is available", async () => {
    await render(funds(0));
    expect(container.textContent).toContain("reconciliation.funds.owed.readyToWithdraw");
    expect(findOne(container, (element) => element.getAttribute("data-owed-total") !== null).textContent).toMatch(/39,625\.03/);
    expect(button("reconciliation.funds.recordButton").disabled).toBe(true);
    expect(container.textContent).not.toContain("reconciliation.funds.nothingAvailable");
  });

  it("blocks an amount above what is available and records a valid one only after confirming", async () => {
    await render(funds(50000));
    await click(button("reconciliation.funds.recordButton"));
    await type(0, "600.00");
    await type(2, "MBB-778899");
    expect(container.textContent).toContain("reconciliation.funds.dialog.overAvailable");
    expect(button("reconciliation.funds.dialog.submit").disabled).toBe(true);

    await type(0, "250.50");
    expect(button("reconciliation.funds.dialog.submit").disabled).toBe(false);
    mocks.confirm.mockResolvedValueOnce(false);
    await act(async () => { findOne(container, (element) => element.tagName === "FORM").dispatchEvent(new TestEvent("submit", { bubbles: true })); await new Promise((resolve) => setTimeout(resolve, 0)); });
    expect(posts()).toHaveLength(0);

    mocks.fetch.mockResolvedValue(ok(funds(24950)));
    await act(async () => { findOne(container, (element) => element.tagName === "FORM").dispatchEvent(new TestEvent("submit", { bubbles: true })); await new Promise((resolve) => setTimeout(resolve, 0)); });
    expect(posts()).toEqual([expect.objectContaining({ action: "record", amountSen: 25050, reference: "MBB-778899" })]);
  });

  it("voids a transfer only with a reason and never offers voiding twice", async () => {
    const transfer = { id: "t-1", amountSen: 1000, transferredOn: "2026-10-20", reference: "MBB-1", note: null, createdAt: "2026-10-20T01:00:00Z", recordedBy: "Admin", voidedAt: null, voidReason: null };
    await render(funds(0, [transfer, { ...transfer, id: "t-2", voidedAt: "2026-10-21T01:00:00Z", voidReason: "Duplicate" }]));
    expect(findElements(container, (element) => element.tagName === "BUTTON" && element.textContent === "reconciliation.funds.history.void")).toHaveLength(1);

    mocks.prompt.mockResolvedValueOnce(null);
    await click(button("reconciliation.funds.history.void"));
    expect(posts()).toHaveLength(0);

    mocks.prompt.mockResolvedValueOnce("Recorded twice");
    await click(button("reconciliation.funds.history.void"));
    expect(posts()).toEqual([{ action: "void", id: "t-1", reason: "Recorded twice" }]);
  });
});
