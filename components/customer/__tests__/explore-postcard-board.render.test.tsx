import React, { act } from "react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { TestEvent, findElements, findOne, installTestDom, type TestDocument, type TestElement } from "@/components/shared/__tests__/render-test-dom";

vi.mock("next/link", () => ({ default: (props: { children?: React.ReactNode }) => <a {...props} /> }));
vi.mock("next/image", () => ({ default: () => null }));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string, options?: Record<string, unknown>) => (options ? `${key}|${JSON.stringify(options)}` : key) }),
}));
vi.mock("@/components/shared/reference-price", () => ({ ReferencePrice: ({ amountMYR }: { amountMYR: number }) => <span>RM{amountMYR}</span> }));
// The test DOM does not model Radix portals; render the open dialog inline.
vi.mock("@/components/ui/dialog", () => ({
  Dialog: ({ open, children }: { open: boolean; children: React.ReactNode }) => (open ? <div data-testid="dialog">{children}</div> : null),
  DialogContent: ({ children, onKeyDown }: { children: React.ReactNode; onKeyDown?: React.KeyboardEventHandler }) => <div role="dialog" onKeyDown={onKeyDown}>{children}</div>,
  DialogTitle: ({ children }: { children: React.ReactNode }) => <h2>{children}</h2>,
  DialogDescription: ({ children }: { children: React.ReactNode }) => <p>{children}</p>,
}));
// The real outline needs SVG path rendering; keep its contract (select by state id) with a stand-in.
vi.mock("@/components/demo-map/malaysia-state-map", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/components/demo-map/malaysia-state-map")>()),
  MalaysiaStateOutline: (props: { onSelectState: (id: string) => void; viewBox: string; regionTransforms: Record<string, string> }) => {
    outlineProps = props;
    return <button type="button" data-testid="map-sabah" onClick={() => props.onSelectState("sabah")} />;
  },
}));

let outlineProps: { viewBox: string; regionTransforms: Record<string, string> } | null = null;
// One fake ResizeObserver per board; tests size the viewport and fire it like the browser would.
const observers: { callback: () => void; disconnected: boolean }[] = [];
class FakeResizeObserver {
  record: { callback: () => void; disconnected: boolean };
  constructor(callback: () => void) { this.record = { callback, disconnected: false }; observers.push(this.record); }
  observe() {}
  unobserve() {}
  disconnect() { this.record.disconnected = true; }
}
(globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = FakeResizeObserver;

import { ExplorePostcardBoard } from "@/components/customer/explore-postcard-board";
import { getOutletShopHref } from "@/lib/customer/shop-navigation";
import { getPostcardBoardLayout, regionTransform } from "@/lib/customer/postcard-board";

const activity = (id: string, state: string, extra: Record<string, unknown> = {}) => ({
  id, name: `Name ${id}`, price: 10, categorySlug: "activity", image: `/${id}.jpg`, sponsorship: null,
  outlet: { id: `outlet-${id}`, state, city: "City", lat: 5, lng: 116 }, ...extra,
});
const sponsored = activity("s4", "Sabah", { sponsorship: { placementId: "p1", label: "Sponsored" } });
const activities = [
  activity("s1", "Sabah"), activity("s2", "Sabah", { categorySlug: "accommodation" }), activity("s3", "Sabah"), sponsored,
  activity("k1", "Kedah"),
] as never[];

let createRoot: typeof import("react-dom/client").createRoot;
let document: TestDocument;
let container: TestElement;
let root: ReturnType<typeof import("react-dom/client").createRoot>;
const onSponsoredClick = vi.fn();

async function click(element: TestElement) {
  await act(async () => { element.dispatchEvent(new TestEvent("click", { bubbles: true })); await Promise.resolve(); });
}
const board = () => findOne(container, (element) => element.getAttribute("data-testid") === "postcard-board");
const grid = () => findOne(container, (element) => element.getAttribute("data-testid") === "postcard-grid");
const dialog = () => findElements(container, (element) => element.getAttribute("data-testid") === "dialog")[0];
const openButton = (within: TestElement, state: string) =>
  findOne(within, (element) => element.tagName === "BUTTON" && element.getAttribute("aria-label") === `ui.explore.postcard.open|${JSON.stringify({ state })}`);
const links = (within: TestElement) => findElements(within, (element) => element.tagName === "A");
/** Gives the board viewport a size and lets the observer's coalesced frame run. */
async function resizeBoard(width: number, height: number) {
  Object.defineProperty(board(), "clientWidth", { configurable: true, value: width });
  Object.defineProperty(board(), "clientHeight", { configurable: true, value: height });
  await act(async () => {
    for (const observer of observers) if (!observer.disconnected) observer.callback();
    await new Promise((resolve) => setTimeout(resolve, 20));
  });
}

describe("ExplorePostcardBoard", () => {
  beforeAll(async () => {
    document = installTestDom();
    ({ createRoot } = await import("react-dom/client"));
  });
  beforeEach(async () => {
    onSponsoredClick.mockReset();
    // Reduced motion: the postcard shows its back at once.
    window.matchMedia = ((query: string) => ({ matches: query === "(prefers-reduced-motion: reduce)", media: query })) as typeof window.matchMedia;
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container as unknown as Element);
    await act(async () => {
      root.render(<ExplorePostcardBoard activities={activities} statesWithPlaces={["Sabah"]} returnTo="/customer/explore" onSponsoredClick={onSponsoredClick} />);
    });
    await resizeBoard(1232, 620);
  });
  afterEach(() => {
    act(() => root.unmount());
    document.body.removeChild(container);
  });

  it("pins one postcard per destination on the board and repeats them in the phone grid", () => {
    const pins = (within: TestElement) => findElements(within, (element) => element.tagName === "BUTTON" && (element.getAttribute("aria-label") ?? "").startsWith("ui.explore.postcard.open"));
    expect(pins(board())).toHaveLength(16);
    expect(pins(grid())).toHaveLength(16);
    expect(board().getAttribute("class")).toContain("hidden");
    expect(board().getAttribute("class")).toContain("lg:block");
    expect(grid().getAttribute("class")).toContain("lg:hidden");
  });

  it("has no heading, pins every state with a small dot and lets each string open its postcard", async () => {
    expect(container.textContent).not.toContain("ui.explore.statesAndCities");
    expect(container.textContent).not.toContain("ui.explore.exploreByDestination");
    expect(findOne(container, (element) => element.tagName === "SECTION").getAttribute("aria-label")).toBe("ui.explore.destinations");
    const dots = findElements(board(), (element) => element.getAttribute("data-state-dot") !== null);
    expect(dots).toHaveLength(16);
    expect(dots.every((dot) => dot.getAttribute("r") === "4.5")).toBe(true);
    const hits = findElements(board(), (element) => element.getAttribute("data-string-hit") !== null);
    expect(hits).toHaveLength(16);
    expect(hits[0].getAttribute("stroke-width")).toBe("14");
    expect(hits[0].getAttribute("pointer-events")).toBe("stroke");
    await click(findOne(board(), (element) => element.getAttribute("data-string-hit") === "sabah"));
    expect(dialog()).toBeDefined();
    expect(dialog().textContent).toContain("Sabah");
  });

  it("opens a state's back with its tagline, three picks, a sponsored P.S. and the place link", async () => {
    await click(openButton(board(), "Sabah"));
    const back = dialog();
    expect(back.textContent).toContain("Borneo's highland icon and nature trails.");
    const hrefs = links(back).map((link) => link.getAttribute("href"));
    expect(hrefs.filter((href) => href?.startsWith("/customer/products/"))).toHaveLength(3); // s1, s3 and the P.S. (s4)
    expect(hrefs).toContain(getOutletShopHref("outlet-s2"));
    expect(hrefs).toContain("/customer/place/sabah");
    // The place link is the shared See more; the count and state stay in its accessible name.
    const placeLink = links(back).find((link) => link.getAttribute("href") === "/customer/place/sabah");
    expect(placeLink?.textContent).toBe("ui.actions.seeMore");
    expect(placeLink?.getAttribute("aria-label")).toContain(`ui.explore.postcard.seeAll|${JSON.stringify({ count: 4, state: "Sabah" })}`);
    const ps = links(back).find((link) => (link.textContent ?? "").includes("ui.explore.postcard.ps"))!;
    await click(ps);
    expect(onSponsoredClick).toHaveBeenCalledTimes(1);
    expect(onSponsoredClick).toHaveBeenCalledWith(sponsored);
  });

  it("links a state without places to its destination page and shows no P.S.", async () => {
    await click(openButton(grid(), "Negeri Sembilan"));
    const hrefs = links(dialog()).map((link) => link.getAttribute("href"));
    expect(hrefs).toEqual(["/customer/destination/negeri-sembilan"]);
    expect(dialog().textContent).not.toContain("ui.explore.postcard.ps");
  });

  it("draws every layer from one measured layout: strings end on their dots, shapes share the offset", async () => {
    const layout = getPostcardBoardLayout(1232, 620)!;
    expect(outlineProps?.viewBox).toBe(`0 0 ${layout.width} 680`);
    expect(outlineProps?.regionTransforms).toEqual({ peninsular: regionTransform("peninsular", layout), borneo: regionTransform("borneo", layout) });
    const strings = findElements(board(), (element) => element.tagName.toLowerCase() === "path" && element.getAttribute("data-string-hit") === null);
    const hits = findElements(board(), (element) => element.getAttribute("data-string-hit") !== null);
    expect(strings.map((path) => path.getAttribute("d"))).toEqual(hits.map((path) => path.getAttribute("d")));
    for (const hit of hits) {
      const dot = findOne(board(), (element) => element.getAttribute("data-state-dot") === hit.getAttribute("data-string-hit"));
      expect(hit.getAttribute("d")!.endsWith(` ${dot.getAttribute("cx")},${dot.getAttribute("cy")}`)).toBe(true);
    }
    const postcard = openButton(board(), "Perlis");
    const style = postcard.style as unknown as Record<string, string>;
    expect(style.width).toBe(`${layout.card.w}px`);
    expect(style.height).toBe(`${layout.card.h}px`);
  });

  it("draws nothing while the board has no size and lays out again when it gets one", async () => {
    await resizeBoard(0, 0);
    expect(findElements(board(), (element) => element.getAttribute("data-state-dot") !== null)).toHaveLength(0);
    expect(findElements(board(), (element) => element.tagName === "BUTTON" || element.tagName.toLowerCase() === "path")).toHaveLength(0);
    await resizeBoard(976, 620);
    const layout = getPostcardBoardLayout(976, 620)!;
    expect(outlineProps?.viewBox).toBe(`0 0 ${layout.width} 680`);
    expect(findElements(board(), (element) => element.getAttribute("data-state-dot") !== null)).toHaveLength(16);
  });

  it("disconnects its observer on unmount", () => {
    const live = observers.filter((observer) => !observer.disconnected);
    expect(live).toHaveLength(1);
    act(() => root.unmount());
    expect(live[0].disconnected).toBe(true);
    root = createRoot(container as unknown as Element);
  });

  it("opens from the map and steps to the next postcard", async () => {
    await click(findOne(container, (element) => element.getAttribute("data-testid") === "map-sabah"));
    const title = () => findOne(dialog(), (element) => element.tagName === "H2").textContent;
    expect(title()).toBe("ui.explore.postcard.greetingsFrom Sabah");
    await click(findOne(dialog(), (element) => element.getAttribute("aria-label") === "ui.explore.postcard.next"));
    expect(title()).not.toBe("ui.explore.postcard.greetingsFrom Sabah");
  });
});

describe("postcard paper colours", () => {
  it("keeps paper text on paper-only tokens, which stay readable in dark mode", async () => {
    const { readFileSync } = await import("node:fs");
    const source = readFileSync("components/customer/explore-postcard-board.tsx", "utf8");
    const css = readFileSync("app/globals.css", "utf8");
    const dark = css.slice(css.indexOf(".dark {"), css.indexOf("}", css.indexOf(".dark {")));
    // The paper stays cream in dark mode, so its accent and ink must not switch to the dark-theme values.
    expect(dark).not.toMatch(/--mw-paper/);
    expect(source).not.toContain("text-[color:var(--mw-string)]");
    expect(source).toContain("text-[color:var(--mw-paper-accent)]");
    expect(source).not.toMatch(/ReferencePrice[^>]*text-primary/);
  });

  it("lets the enlarged postcard scroll on short phone screens", async () => {
    const { readFileSync } = await import("node:fs");
    const source = readFileSync("components/customer/explore-postcard-board.tsx", "utf8");
    expect(source).toMatch(/<DialogContent\s+className="[^"]*max-h-\[calc\(100dvh-2rem\)\][^"]*overflow-y-auto/);
  });
});
