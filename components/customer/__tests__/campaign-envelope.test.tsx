import React, { act } from "react";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { findOne, installTestDom, TestElement, TestEvent, type TestDocument } from "@/components/shared/__tests__/render-test-dom";
import type { PromotionCampaignPublic } from "@/lib/promotion-campaigns/types";

const push = vi.fn();
const router = { push };
vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key: string) => key, i18n: { resolvedLanguage: "en" } }) }));
vi.mock("next/navigation", () => ({ useRouter: () => router }));
vi.mock("next/link", () => {
  const MockLink = React.forwardRef<HTMLAnchorElement, React.AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }>(({ href, children, ...props }, ref) => <a ref={ref} href={href} {...props}>{children}</a>);
  MockLink.displayName = "MockLink";
  return { default: MockLink };
});
// Behaves like a translated title: the default rendering carries a "show original" button.
vi.mock("@/components/customer/localized-content", () => ({
  LocalizedContent: ({ sourceText, children }: { sourceText: string; children?: (value: { text: string; control: React.ReactNode; pending: boolean }) => React.ReactNode }) => {
    const control = <button type="button" data-show-original>original</button>;
    return children ? <>{children({ text: sourceText, control, pending: false })}</> : <>{sourceText}{control}</>;
  },
}));

import { CampaignEnvelope } from "@/components/customer/campaign-envelope";

const location = (id: string, name: string) => ({ id, name, address: null, lat: null, lng: null, startsOn: "2026-10-01", endsOn: "2026-10-08", opensAt: "10:00", closesAt: "18:00" });
const campaign: PromotionCampaignPublic = {
  id: "campaign", slug: "sample-event", title: "Sample event", summary: "", description: "",
  posterUrl: null, operatingHours: null,
  startsAt: "2026-09-30T16:00:00.000Z", endsAt: "2026-10-08T15:59:59.999Z",
  visibility: "upcoming", locations: [location("a", "Bangsar"), location("b", "Penang")], vendors: [],
};

describe("campaign envelope markup", () => {
  it("shows only the invitation, name, dates and places on the closed front", () => {
    const markup = renderToStaticMarkup(<CampaignEnvelope campaign={campaign} />);
    expect(markup).toContain("ui.promotionCampaigns.invitedTo");
    expect(markup).toContain("Sample event");
    expect(markup).toContain("Oct 1, 2026");
    expect(markup).toContain("Oct 8, 2026");
    expect(markup).toContain("Bangsar · Penang");
    expect(markup).toContain('href="/customer/events/sample-event"');
  });

  it("exposes one heading to assistive tech; the two visual copies are hidden", () => {
    const markup = renderToStaticMarkup(<CampaignEnvelope campaign={campaign} />);
    expect(markup.match(/<h2/g)).toHaveLength(1);
    expect(markup.match(/id="campaign-envelope-campaign-title"/g)).toHaveLength(1);
    expect(markup.match(/data-k="(top|flap)" aria-hidden="true"/g)).toHaveLength(2);
    expect(markup).not.toMatch(/data-k="bottom" aria-hidden/);
  });

  it("keeps translation controls out of the two hidden copies", () => {
    const markup = renderToStaticMarkup(<CampaignEnvelope campaign={campaign} />);
    expect(markup.match(/data-show-original/g)).toHaveLength(1);
  });

  it("omits the stalls row without vendors and caps the location list", () => {
    const many = { ...campaign, locations: ["a", "b", "c", "d", "e"].map((id) => location(id, `Place ${id}`)) };
    const markup = renderToStaticMarkup(<CampaignEnvelope campaign={many} />);
    expect(markup).not.toContain("ui.promotionCampaigns.stallsJoining");
    expect(markup.match(/mw-envelope__loc /g)).toHaveLength(3);
    expect(markup).toContain("mw-envelope__more-wide");
    expect(markup).toContain("ui.promotionCampaigns.moreLocations");
  });
});

describe("campaign envelope stylesheet contract", () => {
  const css = readFileSync(join(process.cwd(), "app/globals.css"), "utf8");
  const rules = css.match(/[^{}]*mw-envelope[^{}]*\{[^}]*\}/g) ?? [];
  it("lets the letter link take clicks once the strip has flown off", () => {
    // A piece's own box spans the whole card; only its clipped fold may take pointer events.
    expect(css).toContain(".mw-envelope__pc { position: absolute; left: 0; right: 0; top: 0; height: var(--h0); pointer-events: none; }");
    expect(css).toContain(".mw-envelope__fold { transform-origin: 0 0; background: #fffdf6; pointer-events: auto; }");
    expect(css).toContain('.mw-envelope[data-state="open"] .mw-envelope__pc:is([data-k="top"], [data-k="flap"]) .mw-envelope__fold { pointer-events: none; }');
  });
  it("never lifts the envelope above the carousel arrows", () => {
    expect(rules.length).toBeGreaterThan(10);
    expect(rules.filter((rule) => rule.includes("z-index"))).toEqual([]);
  });
});

describe("campaign envelope interactions", () => {
  let document: TestDocument;
  let container: TestElement;
  let root: ReturnType<typeof import("react-dom/client").createRoot>;
  let createRoot: typeof import("react-dom/client").createRoot;
  let touch = false;
  let width = 1200;
  let pendingAnimations = false;
  let resizeCallback: (() => void) | null = null;
  const reverse = vi.fn();
  let created: { cancel(): void }[] = [];

  beforeAll(async () => {
    document = installTestDom();
    ({ createRoot } = await import("react-dom/client"));
    const proto = TestElement.prototype as unknown as Record<string, unknown>;
    proto.append = function (this: TestElement, node: TestElement) { this.appendChild(node); };
    proto.remove = function (this: TestElement) { this.parentNode?.removeChild(this); };
    proto.animate = () => {
      // Pending animations only settle when cancelled, which rejects `finished` like the real WAAPI.
      let reject: (error: Error) => void = () => {};
      const finished = pendingAnimations ? new Promise<void>((_, fail) => { reject = fail; }) : Promise.resolve();
      const animation = { finished, reverse, cancel() { reject(new Error("AbortError")); }, updatePlaybackRate() {} };
      created.push(animation);
      return animation;
    };
    proto.getAnimations = () => created;
    (globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = class { constructor(callback: () => void) { resizeCallback = callback; } observe() {} disconnect() {} };
    Object.defineProperty(TestElement.prototype, "clientWidth", { configurable: true, get: () => width });
    proto.getBoundingClientRect = () => ({ top: 600, bottom: 1040, left: 0, right: 1200, width: 1200, height: 440 });
    globalThis.requestAnimationFrame = (callback: FrameRequestCallback) => setTimeout(() => callback(performance.now()), 16) as unknown as number;
    globalThis.cancelAnimationFrame = (id: number) => clearTimeout(id);
  });
  beforeEach(() => {
    vi.useFakeTimers();
    push.mockReset();
    reverse.mockReset();
    created = [];
    touch = false;
    width = 1200;
    pendingAnimations = false;
    // Reduced motion keeps state changes independent of tween timing (covered by the geometry tests and the browser check).
    window.matchMedia = ((query: string) => ({ matches: (touch && query === "(hover: none)") || query === "(prefers-reduced-motion: reduce)", media: query })) as typeof window.matchMedia;
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container as unknown as Element);
  });
  afterEach(() => {
    act(() => root.unmount());
    document.body.removeChild(container);
    vi.useRealTimers();
  });

  const article = () => findOne(container, (element) => element.tagName === "ARTICLE");
  const link = () => findOne(container, (element) => element.tagName === "A");
  const state = () => article().getAttribute("data-state");
  const fire = async (target: { dispatchEvent(event: TestEvent): boolean }, type: string, extra: Record<string, unknown> = {}) => {
    await act(async () => { target.dispatchEvent(Object.assign(new TestEvent(type, { bubbles: true }), extra)); });
  };
  const wait = async (ms: number) => { await act(async () => { vi.advanceTimersByTime(ms); }); await act(async () => {}); };
  const render = async () => { await act(async () => { root.render(<CampaignEnvelope campaign={campaign} />); }); };

  it("keeps the envelope drawable through StrictMode ref replay", async () => {
    await act(async () => {
      root.render(<React.StrictMode><CampaignEnvelope campaign={campaign} /></React.StrictMode>);
    });
    expect(article().style.height).toBe("440px");
    await fire(article(), "pointerenter", { pointerType: "mouse" });
    expect(state()).toBe("open");
    await fire(article(), "pointerleave", { pointerType: "mouse" });
    expect(state()).toBe("closed");
  });

  it("ignores a queued resize callback after the envelope unmounts", async () => {
    await render();
    const detachedArticle = article();
    const queuedResize = resizeCallback;
    await act(async () => { root.render(<></>); });
    width = 500;
    expect(() => queuedResize?.()).not.toThrow();
    expect(detachedArticle.style.height).toBe("440px");
  });

  it("does not draw or queue another frame when a stale animation frame arrives", async () => {
    window.matchMedia = ((query: string) => ({ matches: false, media: query })) as typeof window.matchMedia;
    let queuedFrame: FrameRequestCallback | undefined;
    const requestFrame = vi.spyOn(globalThis, "requestAnimationFrame").mockImplementation((callback) => {
      queuedFrame = callback;
      return 1;
    });
    try {
      await render();
      await fire(article(), "pointerenter", { pointerType: "mouse" });
      expect(state()).toBe("busy");
      expect(queuedFrame).toBeDefined();
      await act(async () => { root.render(<></>); });
      expect(() => queuedFrame?.(performance.now())).not.toThrow();
      expect(requestFrame).toHaveBeenCalledTimes(1);
      expect(push).not.toHaveBeenCalled();
    } finally {
      requestFrame.mockRestore();
    }
  });

  it("finishes a running tear after the same campaign re-renders", async () => {
    window.matchMedia = ((query: string) => ({ matches: false, media: query })) as typeof window.matchMedia;
    const clock = vi.spyOn(performance, "now").mockImplementation(() => Date.now());
    const requestFrame = vi.spyOn(globalThis, "requestAnimationFrame").mockImplementation((callback) =>
      setTimeout(() => callback(performance.now()), 16) as unknown as number);
    try {
      await render();
      await fire(article(), "pointerenter", { pointerType: "mouse" });
      await wait(32);
      await act(async () => { root.render(<CampaignEnvelope campaign={{ ...campaign }} />); });
      await wait(500);
      expect(state()).toBe("open");
      await fire(article(), "pointerleave", { pointerType: "mouse" });
      await wait(700);
      expect(state()).toBe("closed");
    } finally {
      requestFrame.mockRestore();
      clock.mockRestore();
    }
  });

  it("opens on hover and closes when the mouse leaves, keeping its height", async () => {
    await render();
    const height = article().style.height;
    expect(height).toBe("440px");
    await fire(article(), "pointerenter", { pointerType: "mouse" });
    expect(state()).toBe("open");
    expect(article().style.height).toBe(height);
    await fire(article(), "pointerleave", { pointerType: "mouse" });
    expect(state()).toBe("closed");
    expect(article().style.height).toBe(height);
  });

  it("ignores a single mouse click and opens the event page on a double click", async () => {
    await render();
    await fire(article(), "click");
    await wait(300);
    expect(state()).toBe("closed");
    expect(push).not.toHaveBeenCalled();
    await fire(article(), "click");
    await fire(article(), "click");
    await wait(0);
    expect(push).toHaveBeenCalledWith("/customer/events/sample-event");
  });

  it("toggles on single taps, goes to the event on a double tap, and closes on an outside tap", async () => {
    touch = true;
    await render();
    await fire(article(), "click");
    await wait(260);
    expect(state()).toBe("open");
    await fire(article(), "click");
    await wait(260);
    expect(state()).toBe("closed");
    await fire(article(), "click");
    await wait(260);
    expect(state()).toBe("open");
    await fire(document, "pointerdown");
    expect(state()).toBe("closed");
    await fire(article(), "click");
    await fire(article(), "click");
    await wait(0);
    expect(push).toHaveBeenCalledWith("/customer/events/sample-event");
  });

  it("opens while focus is inside and closes when neither focus nor hover remains", async () => {
    await render();
    await fire(link(), "focusin");
    expect(state()).toBe("open");
    await fire(link(), "focusout", { relatedTarget: null });
    expect(state()).toBe("closed");
    await fire(article(), "pointerenter", { pointerType: "mouse" });
    await fire(link(), "focusin");
    await fire(link(), "focusout", { relatedTarget: null });
    expect(state()).toBe("open");
  });

  it("does not reseal the strip when a double tap opens and leaves in one go", async () => {
    touch = true;
    await render();
    await fire(article(), "click");
    await fire(article(), "click");
    await wait(0);
    expect(push).toHaveBeenCalledWith("/customer/events/sample-event");
    expect(reverse).not.toHaveBeenCalled();
  });

  it("does not leak a rejection when it unmounts mid-animation", async () => {
    const unhandled = vi.fn();
    process.on("unhandledRejection", unhandled);
    pendingAnimations = true;
    await render();
    await fire(article(), "pointerenter", { pointerType: "mouse" });
    expect(state()).toBe("busy");
    await act(async () => { root.render(<></>); });
    vi.useRealTimers();
    await new Promise((resolve) => setTimeout(resolve, 20));
    process.off("unhandledRejection", unhandled);
    expect(unhandled).not.toHaveBeenCalled();
  });

  it("re-measures after a resize that happens while open", async () => {
    await render();
    await fire(article(), "pointerenter", { pointerType: "mouse" });
    width = 500;
    await act(async () => { resizeCallback?.(); });
    await fire(article(), "pointerleave", { pointerType: "mouse" });
    expect(state()).toBe("closed");
    expect(article().getAttribute("data-narrow")).toBe("true");
    expect(article().style.height).toBe("480px");
  });

  it("lets the title's translation control work without toggling the envelope", async () => {
    touch = true;
    await render();
    await fire(findOne(container, (element) => element.hasAttribute("data-show-original")), "click");
    await wait(300);
    expect(state()).toBe("closed");
  });
});
