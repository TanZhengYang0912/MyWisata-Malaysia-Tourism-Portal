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
// Full-day campaign: 1–8 Oct 2026 in Malaysia time.
const campaign: PromotionCampaignPublic = {
  id: "campaign", slug: "sample-event", title: "Sample event", summary: "", description: "",
  posterUrl: null, operatingHours: null,
  startsAt: "2026-09-30T16:00:00.000Z", endsAt: "2026-10-08T15:59:59.999Z",
  visibility: "upcoming", locations: [location("a", "Bangsar"), location("b", "Penang")], vendors: [],
};
// Timed campaign: 25 Sep 2026, 6:50 PM to 13 Mar 2027, 7:00 AM in Malaysia time.
const timed: PromotionCampaignPublic = { ...campaign, startsAt: "2026-09-25T10:50:00.000Z", endsAt: "2027-03-12T23:00:00.000Z" };

describe("campaign envelope markup", () => {
  it("shows the invitation, dates and first place on the front, with no status or hints", () => {
    const fullDay = renderToStaticMarkup(<CampaignEnvelope campaign={campaign} />);
    for (const key of ["invitedTo", "envelopeStarts", "envelopeEnds"]) expect(fullDay).toContain(`ui.promotionCampaigns.${key}`);
    expect(fullDay).toContain("ui.labels.location");
    expect(fullDay).toContain("Oct 1, 2026");
    expect(fullDay).toContain("Oct 8, 2026");
    expect(fullDay).not.toContain('class="t"');
    expect(fullDay).toContain("Bangsar");
    expect(fullDay).toContain("ui.promotionCampaigns.moreLocations");
    expect(fullDay).not.toContain("Penang");
    expect(fullDay.match(/href="\/customer\/events\/sample-event"/g)).toHaveLength(1);
    const link = fullDay.match(/<a [^>]*href="\/customer\/events\/sample-event"[^>]*>/)?.[0] ?? "";
    expect(link).toContain("mw-envelope__alt");
    expect(link).toContain("sr-only");
    expect(link).toContain("focus-visible:not-sr-only");
    for (const gone of ["stallsJoining", "envelopeHint", "insideEvent", "viewCampaign", "ui.promotionCampaigns.upcoming"]) expect(fullDay).not.toContain(gone);

    const timedMarkup = renderToStaticMarkup(<CampaignEnvelope campaign={timed} />);
    expect(timedMarkup).toContain("Sep 25, 2026");
    expect(timedMarkup).toContain("6:50 PM");
    expect(timedMarkup).toContain("Mar 13, 2027");
    expect(timedMarkup).toContain("7:00 AM");
  });

  it("splits the title at its first spaced dash, and keeps the translation control in the eyebrow", () => {
    const markup = renderToStaticMarkup(<CampaignEnvelope campaign={{ ...campaign, title: "Heritage Walk KL — Local Explorer Picks" }} />);
    expect(markup).toContain('<h2 id="campaign-envelope-campaign-title" class="mw-envelope__title" data-sub="true"><span class="mw-envelope__main">Heritage Walk KL</span><span class="mw-envelope__subtitle">Local Explorer Picks</span></h2>');
    const eyebrows = markup.match(/<span class="mw-envelope__eyebrow">[\s\S]*?<\/span>/g) ?? [];
    expect(eyebrows.filter((eyebrow) => eyebrow.includes("data-show-original"))).toHaveLength(1);

    const demo = renderToStaticMarkup(<CampaignEnvelope campaign={{ ...campaign, slug: "demo-pop-up-fiesta", title: "Demo – Pop-up Fiesta" }} />);
    expect(demo).toContain('<h2 id="campaign-envelope-campaign-title" class="mw-envelope__title"><span class="mw-envelope__main">Pop-up Fiesta</span></h2>');
    expect(demo).not.toContain("mw-envelope__subtitle");
    expect(demo).not.toContain("data-sub");
  });

  it("hides the letter, which carries the poster and the main title only", () => {
    const posterUrl = "https://abcdefghijklmnop.supabase.co/storage/v1/object/public/campaign-posters/p.jpg";
    const markup = renderToStaticMarkup(<CampaignEnvelope campaign={{ ...campaign, posterUrl, title: "Heritage Walk KL — Local Explorer Picks" }} />);
    expect(markup).toContain('class="mw-envelope__pocket" aria-hidden="true"');
    const pocket = markup.slice(markup.indexOf('class="mw-envelope__pocket"'), markup.indexOf('data-k="bottom"'));
    expect(pocket).toContain("Heritage Walk KL");
    expect(pocket).not.toContain("Local Explorer Picks");
    expect(markup.indexOf("<img")).toBeLessThan(markup.indexOf('data-slot="campaign-envelope-front"'));
  });

  it("picks the stamp by carousel position", () => {
    const stampAt = (position: number) => renderToStaticMarkup(<CampaignEnvelope campaign={campaign} position={position} />).match(/data-stamp="([a-z]+)"/)?.[1];
    expect([0, 1, 2, 3].map(stampAt)).toEqual(["hibiscus", "tiger", "stall", "hibiscus"]);
  });

  it("exposes one heading to assistive tech; the hidden parts of each copy stay hidden", () => {
    const markup = renderToStaticMarkup(<CampaignEnvelope campaign={campaign} />);
    expect(markup.match(/<h2/g)).toHaveLength(1);
    expect(markup.match(/id="campaign-envelope-campaign-title"/g)).toHaveLength(1);
    // The title sits on the top half and the dates on the bottom half, so each is read from where it shows.
    expect(markup).not.toContain('data-k="flap"');
    expect(markup).not.toMatch(/data-k="(top|bottom)" aria-hidden/);
    expect(markup.match(/class="mw-envelope__head"(?! aria-hidden)/g)).toHaveLength(1);
    expect(markup.match(/class="mw-envelope__body"(?! aria-hidden)/g)).toHaveLength(1);
    expect(markup.match(/class="mw-envelope__from"(?! aria-hidden)/g)).toHaveLength(1);
  });

  it("keeps translation controls in the visible heading only", () => {
    const markup = renderToStaticMarkup(<CampaignEnvelope campaign={campaign} />);
    expect(markup.match(/data-show-original/g)).toHaveLength(1);
  });

  it("serves a Supabase poster through the image optimizer", () => {
    const posterUrl = "https://abcdefghijklmnop.supabase.co/storage/v1/object/public/campaign-posters/p.jpg";
    const markup = renderToStaticMarkup(<CampaignEnvelope campaign={{ ...campaign, posterUrl }} />);
    const images = markup.match(/<img [^>]*>/g) ?? [];
    expect(images.length).toBeGreaterThan(0);
    for (const image of images) expect(image).toContain("/_next/image?url=");
  });
});

describe("campaign envelope stylesheet contract", () => {
  const css = readFileSync(join(process.cwd(), "app/globals.css"), "utf8");
  const rules = css.match(/[^{}]*mw-envelope[^{}]*\{[^}]*\}/g) ?? [];
  // A match can start with the comment above the rule, so compare the selector without it.
  const rule = (selector: string) => rules.find((candidate) => candidate.replace(/\/\*[\s\S]*?\*\//g, "").trim().startsWith(selector)) ?? "";
  it("lets only the tab and the link take pointer events", () => {
    expect(rule(".mw-envelope__grip {")).toContain("touch-action: pan-y pinch-zoom");
    expect(rule(".mw-envelope__pc {")).toContain("pointer-events: none");
    expect(rule('.mw-envelope[data-state="gone"] :is(.mw-envelope__grip, .mw-envelope__alt)')).toContain("pointer-events: none");
    expect(rule('.mw-envelope:is([data-state="busy"], [data-state="gone"]) .mw-envelope__alt')).toContain("opacity: 0");
  });
  it("never lifts the envelope above the carousel arrows", () => {
    expect(rules.length).toBeGreaterThan(10);
    expect(rules.filter((candidate) => candidate.includes("z-index"))).toEqual([]);
  });
});

describe("campaign envelope interactions", () => {
  let document: TestDocument;
  let container: TestElement;
  let root: ReturnType<typeof import("react-dom/client").createRoot>;
  let createRoot: typeof import("react-dom/client").createRoot;
  let width = 1200;
  let pendingAnimations = false;
  let resizeCallback: (() => void) | null = null;
  let created: { cancel(): void }[] = [];
  const focused: TestElement[] = [];
  const captured = new Set<number>();

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
      const animation = { finished, cancel() { reject(new Error("AbortError")); } };
      created.push(animation);
      return animation;
    };
    proto.getAnimations = () => created;
    // Pointer capture and focus are not in the shared test DOM; record them here.
    proto.setPointerCapture = (id: number) => { captured.add(id); };
    proto.releasePointerCapture = (id: number) => { captured.delete(id); };
    proto.hasPointerCapture = (id: number) => captured.has(id);
    proto.focus = function (this: TestElement) { focused.push(this); };
    (globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = class { constructor(callback: () => void) { resizeCallback = callback; } observe() {} disconnect() {} };
    Object.defineProperty(TestElement.prototype, "clientWidth", { configurable: true, get: () => width });
    proto.getBoundingClientRect = () => ({ top: 600, bottom: 1040, left: 0, right: 1200, width: 1200, height: 440 });
    globalThis.requestAnimationFrame = (callback: FrameRequestCallback) => setTimeout(() => callback(performance.now()), 16) as unknown as number;
    globalThis.cancelAnimationFrame = (id: number) => clearTimeout(id);
  });
  beforeEach(() => {
    vi.useFakeTimers();
    push.mockReset();
    created = [];
    focused.length = 0;
    captured.clear();
    width = 1200;
    pendingAnimations = false;
    // Reduced motion keeps state changes independent of tween timing (covered by the geometry tests and the browser check).
    window.matchMedia = ((query: string) => ({ matches: query === "(prefers-reduced-motion: reduce)", media: query })) as typeof window.matchMedia;
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
  const grip = () => findOne(container, (element) => element.tagName === "BUTTON" && element.getAttribute("class") === "mw-envelope__grip");
  const link = () => findOne(container, (element) => element.tagName === "A");
  const state = () => article().getAttribute("data-state");
  const fire = async (target: { dispatchEvent(event: TestEvent): boolean }, type: string, extra: Record<string, unknown> = {}) => {
    const event = Object.assign(new TestEvent(type, { bubbles: true }), extra);
    await act(async () => { target.dispatchEvent(event); });
    return event;
  };
  const wait = async (ms: number) => { await act(async () => { vi.advanceTimersByTime(ms); }); await act(async () => {}); };
  const render = async () => { await act(async () => { root.render(<CampaignEnvelope campaign={campaign} />); }); };
  const pointer = (clientX: number) => ({ pointerId: 1, isPrimary: true, button: 0, clientX });
  const drag = async (to: number, end: "pointerup" | "pointercancel" = "pointerup") => {
    await fire(grip(), "pointerdown", pointer(0));
    await fire(grip(), "pointermove", pointer(to));
    await fire(grip(), end, pointer(to));
  };

  it("keeps the envelope drawable through StrictMode ref replay", async () => {
    await act(async () => {
      root.render(<React.StrictMode><CampaignEnvelope campaign={campaign} /></React.StrictMode>);
    });
    expect(article().style.height).toBe("460px");
    await drag(950);
    await wait(0);
    expect(state()).toBe("gone");
    expect(push).toHaveBeenCalledTimes(1);
  });

  it("ignores a queued resize callback after the envelope unmounts", async () => {
    await render();
    const detachedArticle = article();
    const queuedResize = resizeCallback;
    await act(async () => { root.render(<></>); });
    width = 500;
    expect(() => queuedResize?.()).not.toThrow();
    expect(detachedArticle.style.height).toBe("460px");
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
      await fire(grip(), "click", { detail: 0 });
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
      await fire(grip(), "click", { detail: 0 });
      await wait(32);
      await act(async () => { root.render(<CampaignEnvelope campaign={{ ...campaign }} />); });
      await wait(500);
      expect(state()).toBe("gone");
      expect(push).toHaveBeenCalledTimes(1);
      expect(push).toHaveBeenCalledWith("/customer/events/sample-event");
    } finally {
      requestFrame.mockRestore();
      clock.mockRestore();
    }
  });

  it("rests the closed letter on the strip, showing only the band under it", async () => {
    await render();
    const letter = findOne(container, (element) => element.getAttribute("data-slot") === "campaign-envelope-letter");
    // offsetHeight is 0 in the test DOM: rest = a + sh / 2 = 288, band = a..a + sh.
    expect(letter.style.transform).toBe("translateY(288px)");
    expect(letter.style.clipPath).toBe("inset(-24px 0px -24px 0px round 16px)");
  });

  it("reveals the poster by clipping two flat pieces while the tab moves", async () => {
    window.matchMedia = ((query: string) => ({ matches: false, media: query })) as typeof window.matchMedia;
    await render();
    const top = findOne(container, (element) => element.getAttribute("data-k") === "top");
    const fold = findOne(top, (element) => element.getAttribute("class") === "mw-envelope__fold");
    const closedClip = fold.style.clipPath;
    await fire(grip(), "pointerdown", pointer(0));
    await fire(grip(), "pointermove", pointer(600));

    expect(state()).toBe("drag");
    expect(fold.style.clipPath).not.toBe(closedClip);
    expect(Array.from(article().children).map((child) => child.getAttribute("data-k")).filter(Boolean)).toEqual(["bottom", "top"]);
    expect(push).not.toHaveBeenCalled();
  });

  it("springs back below the threshold and ignores the click that ends the drag", async () => {
    await render();
    await fire(grip(), "pointerdown", pointer(0));
    await fire(grip(), "pointermove", pointer(600));
    expect(article().getAttribute("data-ready")).toBe("false");
    // The tab follows the pointer 1:1 (travel at width 1200 is 1182px).
    expect(parseFloat((grip().style as unknown as Record<string, string>)["--drag"])).toBeCloseTo(600, 6);
    await fire(grip(), "pointerup", pointer(600));
    await fire(grip(), "click", { detail: 1 });
    await wait(0);
    expect(state()).toBe("closed");
    expect(push).not.toHaveBeenCalled();
  });

  it("opens and goes to the event page once dragged past the threshold", async () => {
    await render();
    await fire(grip(), "pointerdown", pointer(0));
    await fire(grip(), "pointermove", pointer(950));
    expect(article().getAttribute("data-ready")).toBe("true");
    await fire(grip(), "pointerup", pointer(950));
    await wait(0);
    expect(push).toHaveBeenCalledTimes(1);
    expect(push).toHaveBeenCalledWith("/customer/events/sample-event");
    expect(state()).toBe("gone");
  });

  it("treats a press that moves 6px or less as a tap that opens it", async () => {
    await render();
    await drag(7);
    await fire(grip(), "click", { detail: 1 });
    await wait(0);
    expect(push).not.toHaveBeenCalled();
    await drag(4);
    expect(state()).toBe("closed");
    expect(push).not.toHaveBeenCalled();
    await fire(grip(), "click", { detail: 1 });
    await wait(0);
    expect(push).toHaveBeenCalledTimes(1);
  });

  it("springs back on a cancelled drag, and a later keyboard click still opens it", async () => {
    await render();
    await drag(950, "pointercancel");
    await wait(0);
    expect(push).not.toHaveBeenCalled();
    expect(state()).toBe("closed");
    await fire(grip(), "click", { detail: 0 });
    await wait(0);
    expect(push).toHaveBeenCalledTimes(1);
  });

  it("opens on Enter or Space (a click without a pointer)", async () => {
    await render();
    await fire(grip(), "click", { detail: 0 });
    await wait(0);
    expect(push).toHaveBeenCalledTimes(1);
  });

  it("opens from the link on a plain click and leaves modified clicks to the browser", async () => {
    await render();
    const modified = await fire(link(), "click", { button: 0, metaKey: true });
    await wait(0);
    expect(modified.defaultPrevented).toBe(false);
    expect(push).not.toHaveBeenCalled();
    const plain = await fire(link(), "click", { button: 0 });
    expect(plain.defaultPrevented).toBe(true);
    await wait(0);
    expect(push).toHaveBeenCalledTimes(1);
    expect(state()).toBe("gone");
  });

  it("navigates only once whatever opens it", async () => {
    await render();
    await fire(link(), "click", { button: 0 });
    await fire(grip(), "click", { detail: 0 });
    await drag(950);
    await wait(0);
    expect(push).toHaveBeenCalledTimes(1);
  });

  it("focuses the tab on press so the carousel's focus pause holds during a drag", async () => {
    await render();
    await fire(grip(), "pointerdown", pointer(0));
    expect(focused).toContain(grip());
    expect(captured.has(1)).toBe(true);
  });

  it("re-measures after a resize only once the tab is back at rest", async () => {
    await render();
    await fire(grip(), "pointerdown", pointer(0));
    await fire(grip(), "pointermove", pointer(100));
    width = 360;
    await act(async () => { resizeCallback?.(); });
    expect(article().getAttribute("data-narrow")).toBe("false");
    expect(article().style.height).toBe("460px");
    await fire(grip(), "pointerup", pointer(100));
    await wait(0);
    await act(async () => { resizeCallback?.(); });
    expect(article().getAttribute("data-narrow")).toBe("true");
    expect(article().style.height).toBe("500px");
  });

  it("does not leak a rejection or navigate when it unmounts mid-animation", async () => {
    const unhandled = vi.fn();
    process.on("unhandledRejection", unhandled);
    pendingAnimations = true;
    await render();
    await drag(950);
    expect(state()).toBe("busy");
    await act(async () => { root.render(<></>); });
    await wait(2000);
    expect(push).not.toHaveBeenCalled();
    vi.useRealTimers();
    await new Promise((resolve) => setTimeout(resolve, 20));
    process.off("unhandledRejection", unhandled);
    expect(unhandled).not.toHaveBeenCalled();
  });

  it("lets the title's translation control work without opening the envelope", async () => {
    await render();
    await fire(findOne(container, (element) => element.hasAttribute("data-show-original")), "click");
    await wait(300);
    expect(state()).toBe("closed");
    expect(push).not.toHaveBeenCalled();
  });
});
