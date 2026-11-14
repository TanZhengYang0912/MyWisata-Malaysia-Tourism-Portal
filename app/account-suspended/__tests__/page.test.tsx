import React, { act } from "react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { findElements, findOne, installTestDom, TestEvent, type TestDocument, type TestElement } from "@/components/shared/__tests__/render-test-dom";

const mocks = vi.hoisted(() => ({ userId: "customer-1" }));
vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock("next/link", () => ({ default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => <a href={href} {...rest}>{children}</a> }));
vi.mock("@/components/providers/auth", () => ({ useAuth: () => ({ currentUser: { id: mocks.userId, email: "customer@example.test" } }) }));

import AccountSuspendedPage from "../page";

const operationId = "00000000-0000-4000-8000-000000000001";
const ticketId = "00000000-0000-4000-8000-000000000002";
const storageKey = `mylawatan:suspended-appeal-operation:${mocks.userId}`;
let document: TestDocument;
let createRoot: typeof import("react-dom/client").createRoot;
let root: ReturnType<typeof createRoot>;
let container: TestElement;
let fetchMock: ReturnType<typeof vi.fn>;

beforeAll(async () => {
  document = installTestDom();
  ({ createRoot } = await import("react-dom/client"));
});

beforeEach(() => {
  mocks.userId = "customer-1";
  window.localStorage.clear();
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container as unknown as Element);
});

afterEach(async () => {
  await act(async () => root.unmount());
  document.body.removeChild(container);
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

async function render() {
  await act(async () => root.render(<AccountSuspendedPage />));
}

async function clickButton(label: string) {
  const button = findOne(container, (element) => element.tagName === "BUTTON" && element.textContent.includes(label));
  await act(async () => { button.dispatchEvent(new TestEvent("click", { bubbles: true })); });
}

async function enterAppeal(text: string) {
  const textarea = findOne(container, (element) => element.tagName === "TEXTAREA");
  await act(async () => {
    Object.getOwnPropertyDescriptor(Object.getPrototypeOf(textarea), "value")?.set?.call(textarea, text);
    textarea.dispatchEvent(new TestEvent("input", { bubbles: true }));
  });
}

async function submitAppeal() {
  const form = findOne(container, (element) => element.tagName === "FORM");
  await act(async () => { form.dispatchEvent(new TestEvent("submit", { bubbles: true })); });
}

describe("suspended account appeal recovery", () => {
  it("checks an uncertain result before allowing another submission and opens the created ticket", async () => {
    window.localStorage.setItem(storageKey, operationId);
    fetchMock
      .mockResolvedValueOnce(Response.json({ error: { code: "READ_UNAVAILABLE" } }, { status: 503 }))
      .mockResolvedValueOnce(Response.json({ data: { state: "completed", ticketId } }));

    await render();

    expect(container.textContent).toContain("accountLifecycle.suspended.statusUnknown");
    expect(fetchMock).toHaveBeenCalledWith(`/api/support/operations/${operationId}`, { cache: "no-store" });
    expect(window.localStorage.getItem(storageKey)).toBe(operationId);

    await clickButton("accountLifecycle.suspended.checkResult");

    expect(container.textContent).toContain("accountLifecycle.suspended.appealSubmitted");
    expect(findElements(container, (element) => element.tagName === "A" && element.getAttribute("href") === `/customer/support/${ticketId}`)).toHaveLength(1);
    expect(window.localStorage.getItem(storageKey)).toBeNull();
  });

  it("retains the same operation reference when no ticket is found yet", async () => {
    window.localStorage.setItem(storageKey, operationId);
    fetchMock.mockResolvedValueOnce(Response.json({ data: { state: "not_found" } }));

    await render();

    expect(container.textContent).toContain("accountLifecycle.suspended.operationNotFound");
    expect(window.localStorage.getItem(storageKey)).toBe(operationId);
  });

  it("offers sign-in recovery when the saved result check has an expired session", async () => {
    window.localStorage.setItem(storageKey, operationId);
    fetchMock.mockResolvedValueOnce(Response.json({ error: { code: "UNAUTHORIZED" } }, { status: 401 }));

    await render();

    expect(container.textContent).toContain("accountLifecycle.suspended.signInAgain");
    expect(findElements(container, (element) => element.tagName === "A" && element.getAttribute("href") === "/login?next=%2Faccount-suspended")).toHaveLength(1);
    expect(window.localStorage.getItem(storageKey)).toBe(operationId);
  });

  it("does not resend an appeal after an unknown result and resolves it through the status check", async () => {
    Object.assign(window, { crypto: { randomUUID: () => operationId } });
    fetchMock
      .mockResolvedValueOnce(Response.json({ error: { code: "WRITE_UNAVAILABLE" } }, { status: 503 }))
      .mockResolvedValueOnce(Response.json({ data: { state: "completed", ticketId } }));
    await render();
    await enterAppeal("Please review my suspended account");
    await submitAppeal();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(JSON.parse(String(fetchMock.mock.calls[0][1]?.body))).toEqual({
      body: "Please review my suspended account",
      operationId,
    });
    expect(window.localStorage.getItem(storageKey)).toBe(operationId);
    expect(container.textContent).toContain("accountLifecycle.suspended.statusUnknown");

    await clickButton("accountLifecycle.suspended.checkResult");

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(container.textContent).toContain("accountLifecycle.suspended.appealSubmitted");
    expect(window.localStorage.getItem(storageKey)).toBeNull();
  });

  it("does not send appeal text when it cannot save a retry reference", async () => {
    Object.assign(window, { crypto: { randomUUID: () => operationId } });
    vi.spyOn(window.localStorage, "setItem").mockImplementation(() => { throw new Error("storage blocked"); });
    await render();
    await enterAppeal("Please review my suspended account");
    await submitAppeal();

    expect(fetchMock).not.toHaveBeenCalled();
    expect(container.textContent).toContain("accountLifecycle.suspended.storageUnavailable");
  });
});
