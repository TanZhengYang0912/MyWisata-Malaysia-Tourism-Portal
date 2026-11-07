import { act } from "react";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { findOne, installTestDom, TestElement, TestEvent, type TestDocument } from "@/components/shared/__tests__/render-test-dom";

const mocks = vi.hoisted(() => ({
  run: vi.fn(),
  language: "en",
  devices: [] as Array<{ id: string; label: string }>,
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => `${mocks.language}:${key}` }),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("@/lib/supabase/client", () => ({ createClient: () => ({ auth: { signOut: vi.fn() } }) }));
vi.mock("@/lib/auth/staff-passkey-browser", () => ({ runStaffPasskey: mocks.run }));

import { StaffPasskey } from "../staff-passkey";

let document: TestDocument;
let createRoot: typeof import("react-dom/client").createRoot;
let container: TestElement;
let root: ReturnType<typeof createRoot>;

beforeAll(async () => {
  document = installTestDom();
  ({ createRoot } = await import("react-dom/client"));
});

beforeEach(() => {
  mocks.run.mockReset().mockResolvedValue({ proofId: null });
  mocks.language = "en";
  mocks.devices = [{ id: "owner-device", label: "tsy" }];
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ data: { credentials: mocks.devices, passwordAuthenticated: true } }))));
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container as unknown as Element);
});

afterEach(() => {
  act(() => root.unmount());
  document.body.removeChild(container);
  vi.unstubAllGlobals();
});

async function render() {
  await act(async () => {
    root.render(<StaffPasskey onVerified={vi.fn()} embedded />);
    await Promise.resolve();
  });
}

const button = (key: string) => findOne(container, (element) => element.tagName === "BUTTON" && element.textContent.includes(`passkey.${key}`));

async function click(element: TestElement) {
  await act(async () => {
    element.dispatchEvent(new TestEvent("click", { bubbles: true }));
    await Promise.resolve();
  });
}

async function type(id: string, value: string) {
  const input = findOne(container, (element) => element.tagName === "INPUT" && element.id === id);
  await act(async () => {
    Object.getOwnPropertyDescriptor(TestElement.prototype, "value")?.set?.call(input, value);
    input.dispatchEvent(new TestEvent("input", { bubbles: true }));
    await Promise.resolve();
  });
}

describe("staff passkey device enrollment", () => {
  it("preserves the staff verification route and safe return destination", () => {
    const routeSource = readFileSync(resolve(process.cwd(), "app/auth/staff-verification/page.tsx"), "utf8");
    expect(routeSource).toContain("safeStaffVerificationNext(params.get('next'))");
    expect(routeSource).toContain("window.location.assign(next)");
  });

  it("lets a new device enroll with a code on an account that already has a passkey", async () => {
    await render();
    await click(button("manage"));
    await type("staff-passkey-grant", "  one-time-code  ");
    await click(button("register"));

    expect(mocks.run).toHaveBeenCalledTimes(1);
    expect(mocks.run).toHaveBeenCalledWith(expect.objectContaining({ operation: "register", grant: "one-time-code" }));
  });

  it("still requires the owner to verify an existing passkey before adding a backup without a code", async () => {
    await render();
    await click(button("manage"));
    await click(button("register"));

    expect(mocks.run.mock.calls.map(([input]) => input.operation)).toEqual(["manage", "register"]);
    expect(mocks.run.mock.calls[1][0]).not.toHaveProperty("grant");
  });

  it("re-translates an error when the page language changes", async () => {
    mocks.run.mockRejectedValue(new Error("STAFF_PASSKEY_FAILED"));
    mocks.language = "zh-CN";
    await render();
    await click(button("verify"));
    expect(container.textContent).toContain("zh-CN:passkey.failed");

    mocks.language = "en";
    await render();
    expect(container.textContent).toContain("en:passkey.failed");
    expect(container.textContent).not.toContain("zh-CN:passkey.failed");
  });
});
