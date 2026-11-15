import { act, createElement } from "react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { findOne, installTestDom, TestElement, TestEvent, type TestDocument } from "@/components/shared/__tests__/render-test-dom";

const mocks = vi.hoisted(() => ({ fetch: vi.fn(), showFeedback: vi.fn(), t: (key: string) => key }));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: mocks.t, i18n: { resolvedLanguage: "en" } }),
}));
vi.mock("@/components/providers/action-feedback", () => ({
  useActionFeedback: () => ({ showFeedback: mocks.showFeedback }),
}));

import WalletSettingsPage from "../page";

let document: TestDocument;
let createRoot: typeof import("react-dom/client").createRoot;
let container: TestElement;
let root: ReturnType<typeof createRoot>;

const settings = {
  clearanceDays: 7,
  minAmountSen: 5000,
  dualApprovalThresholdSen: 50000,
  escalationHours: 48,
  holdEscalationHours: 168,
};

beforeAll(async () => {
  document = installTestDom();
  ({ createRoot } = await import("react-dom/client"));
});

beforeEach(() => {
  mocks.fetch.mockReset().mockResolvedValue({
    ok: true,
    json: async () => ({ data: settings }),
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
    root.render(createElement(WalletSettingsPage));
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

function field(label: string) {
  return findOne(container, (element) => element.tagName === "INPUT" && element.getAttribute("aria-label") === label);
}

async function enterValue(input: TestElement, value: string) {
  await act(async () => {
    Object.getOwnPropertyDescriptor(TestElement.prototype, "value")?.set?.call(input, value);
    input.dispatchEvent(new TestEvent("input", { bubbles: true }));
  });
}

describe("WalletSettingsPage numeric inputs", () => {
  it("replaces the temporary zero with the next digit and preserves decimal leading zeroes", async () => {
    await renderPage();

    const clearanceDays = field("ui.walletSettings.fields.clearanceDays");
    await enterValue(clearanceDays, "");
    expect(clearanceDays.value).toBe("0");

    await enterValue(clearanceDays, "07");
    expect(clearanceDays.value).toBe("7");

    const minimumWithdrawal = field("ui.walletSettings.fields.minimumWithdrawal");
    await enterValue(minimumWithdrawal, "0.7");
    expect(minimumWithdrawal.value).toBe("0.7");
  });

});
