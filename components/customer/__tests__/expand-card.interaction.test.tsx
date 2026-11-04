import React, { act } from "react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { findOne, installTestDom, TestEvent, type TestDocument, type TestElement } from "@/components/shared/__tests__/render-test-dom";

vi.mock("next/link", () => ({ default: ({ href, children, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) => <a href={href} {...props}>{children}</a> }));
import { ExpandCard } from "@/components/customer/expand-card";

let createRoot: typeof import("react-dom/client").createRoot;
let document: TestDocument;
let container: TestElement;
let root: ReturnType<typeof import("react-dom/client").createRoot>;
async function render(element: React.ReactElement) {
  await act(async () => { root.render(element); });
}
async function click(element: TestElement) {
  let result = false;
  await act(async () => { result = element.dispatchEvent(new TestEvent("click", { bubbles: true })); });
  return result;
}
function setTouch(touch: boolean) {
  window.matchMedia = ((query: string) => ({ matches: touch && query === "(hover: none)", media: query, addListener: vi.fn(), removeListener: vi.fn(), addEventListener: vi.fn(), removeEventListener: vi.fn(), dispatchEvent: vi.fn(), onchange: null })) as typeof window.matchMedia;
}
function card(onAction = vi.fn(), onSave = vi.fn(), onShare = vi.fn()) {
  return <ExpandCard
    media={<><a href="/card">Cover link</a><button type="button" data-save-control onClick={onSave}>Save</button><button type="button" data-share-control onClick={onShare}>Share</button></>}
    title={<h3>Card title</h3>}
    details={<p>Card-specific details</p>}
    detailsId="card-details"
    action={{ href: "/card", label: "Book Now", onClick: onAction }}
  />;
}
describe("ExpandCard touch interactions", () => {
  beforeAll(async () => { document = installTestDom(); ({ createRoot } = await import("react-dom/client")); });
  beforeEach(() => { setTouch(true); container = document.createElement("div"); document.body.appendChild(container); root = createRoot(container as unknown as Element); });
  afterEach(() => { act(() => root.unmount()); document.body.removeChild(container); });
  const article = () => findOne(container, (element) => element.tagName === "ARTICLE");
  const cover = () => findOne(container, (element) => element.tagName === "A" && element.textContent === "Cover link");
  const cta = () => findOne(container, (element) => element.getAttribute("data-card-primary-cta") === "true");

  it("first tap on a closed card opens it instead of navigating", async () => {
    await render(card());
    expect(await click(cover())).toBe(false);
    expect(article().getAttribute("data-open")).toBe("true");
    expect(await click(cover())).toBe(true);
  });
  it("first tap on the CTA only opens the card; the second tap follows it", async () => {
    const onAction = vi.fn(); await render(card(onAction));
    expect(await click(cta())).toBe(false);
    expect(onAction).not.toHaveBeenCalled();
    expect(article().getAttribute("data-open")).toBe("true");
    expect(await click(cta())).toBe(true);
    expect(onAction).toHaveBeenCalledOnce();
  });
  it("save and share work on the first tap and do not open the card", async () => {
    const save = vi.fn(); const share = vi.fn(); await render(card(vi.fn(), save, share));
    await click(findOne(container, (element) => element.hasAttribute("data-save-control")));
    await click(findOne(container, (element) => element.hasAttribute("data-share-control")));
    expect(save).toHaveBeenCalledOnce(); expect(share).toHaveBeenCalledOnce();
    expect(article().getAttribute("data-open")).toBeNull();
  });
  it("a second tap on a non-link area follows the CTA", async () => {
    const onAction = vi.fn(); await render(card(onAction));
    const title = findOne(container, (element) => element.tagName === "H3");
    await click(title); await click(title);
    expect(onAction).toHaveBeenCalledOnce();
  });
  it("a tap outside closes the open card", async () => {
    await render(card()); await click(cover());
    await act(async () => { document.dispatchEvent(new TestEvent("pointerdown", { bubbles: true })); });
    expect(article().getAttribute("data-open")).toBeNull();
  });
  it("mouse clicks are never intercepted", async () => {
    setTouch(false); await render(card());
    expect(await click(cover())).toBe(true); expect(await click(cta())).toBe(true);
    expect(article().getAttribute("data-open")).toBeNull();
  });
  it("keyboard activation navigates on a touch device", async () => {
    const onAction = vi.fn(); await render(card(onAction));
    const event = Object.assign(new TestEvent("click", { bubbles: true }), { detail: 0 });
    await act(async () => { cta().dispatchEvent(event); });
    expect(event.defaultPrevented).toBe(false);
    expect(onAction).toHaveBeenCalledOnce();
  });
});
