import { act, useState } from "react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { findElements, findOne, installTestDom, TestEvent, type TestDocument, type TestElement } from "@/components/shared/__tests__/render-test-dom";
import type { EventMapRegionId } from "@/lib/promotion-campaigns/event-state-counts";

vi.mock("react-i18next", () => ({ useTranslation: () => ({
  t: (key: string, options?: { state?: string; count?: number }) => options?.state !== undefined ? `${key} ${options.state} ${options.count ?? ""}`.trim() : key,
}) }));

import { EventsMap } from "@/app/customer/events/events-map";
import styles from "@/app/customer/events/events-map.module.css";

const COUNTS: Record<EventMapRegionId, number> = { north: 1, central: 1, south: 2, "east-coast": 0, "east-malaysia": 0 };

describe("EventsMap", () => {
  let createRoot: typeof import("react-dom/client").createRoot;
  let document: TestDocument;
  let container: TestElement;
  let root: ReturnType<typeof createRoot>;

  beforeAll(async () => {
    document = installTestDom();
    ({ createRoot } = await import("react-dom/client"));
  });

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container as unknown as Element);
  });

  afterEach(() => {
    act(() => root.unmount());
    document.body.removeChild(container);
  });

  /** Holds `selected` like the Events page does, so a clear rerenders. */
  function Harness({ counts = COUNTS, initial = null }: { counts?: Record<EventMapRegionId, number>; initial?: EventMapRegionId | null }) {
    const [selected, setSelected] = useState<EventMapRegionId | null>(initial);
    return <EventsMap regionCounts={counts} eventStates={new Set(["kuala-lumpur", "perak", "johor", "melaka"])} selected={selected} onSelect={setSelected} />;
  }

  const show = async (element: React.ReactElement) => { await act(async () => root.render(element)); };
  const pin = (region: EventMapRegionId) => findOne(container, (element) => element.getAttribute("data-region") === region);
  const click = async (element: TestElement) => { await act(async () => element.dispatchEvent(new TestEvent("click", { bubbles: true }))); };
  const reset = () => findElements(container, (element) => element.tagName === "BUTTON" && element.textContent === "ui.promotionCampaigns.map.allMalaysia")[0];
  const land = (stateId: string) => findOne(container, (element) => element.getAttribute("data-land") === stateId);

  it("shows five pins with their counts; empty regions are disabled", async () => {
    await show(<Harness />);
    const pins = findElements(container, (element) => element.getAttribute("data-region") !== null);
    expect(pins.map((element) => [element.getAttribute("data-region"), findOne(element, (child) => child.tagName === "B").textContent])).toEqual([
      ["north", "1"], ["central", "1"], ["south", "2"], ["east-coast", "0"], ["east-malaysia", "0"],
    ]);
    expect(pin("east-coast").getAttribute("disabled")).not.toBeNull();
    expect(pin("east-malaysia").getAttribute("disabled")).not.toBeNull();
    expect(pin("south").getAttribute("disabled")).toBeNull();
    expect(pin("south").getAttribute("aria-label")).toBe("ui.promotionCampaigns.map.markerLabel ui.promotionCampaigns.map.regions.south.title 2");
    expect(reset()).toBeUndefined();
  });

  it("selects a region, shows the reset, and colours its states", async () => {
    const onSelect = vi.fn();
    await show(<EventsMap regionCounts={COUNTS} eventStates={new Set(["johor"])} selected={null} onSelect={onSelect} />);
    await click(pin("south"));
    expect(onSelect).toHaveBeenCalledWith("south");

    await show(<EventsMap regionCounts={COUNTS} eventStates={new Set(["johor"])} selected="south" onSelect={onSelect} />);
    expect(pin("south").getAttribute("aria-pressed")).toBe("true");
    expect(reset()).toBeDefined();
    expect(land("johor").getAttribute("class")).toContain(styles.hasEvents);
    for (const state of ["johor", "melaka", "negeri-sembilan"]) expect(land(state).getAttribute("class")).toContain(styles.inRegion);
    expect(land("perak").getAttribute("class")).not.toContain(styles.inRegion);
    expect(land("melaka").getAttribute("class")).not.toContain(styles.hasEvents);
  });

  it("reset clears the region and returns focus to its pin", async () => {
    await show(<Harness initial="south" />);
    const focus = vi.fn();
    pin("south").focus = focus;
    await click(reset());
    expect(pin("south").getAttribute("aria-pressed")).toBe("false");
    expect(reset()).toBeUndefined();
    expect(focus).toHaveBeenCalledOnce();
  });

  it("keeps a selected empty region enabled, and focuses the map when its pin becomes disabled", async () => {
    await show(<Harness counts={{ ...COUNTS, south: 0 }} initial="south" />);
    expect(pin("south").getAttribute("disabled")).toBeNull();
    const section = findOne(container, (element) => element.tagName === "SECTION");
    const sectionFocus = vi.fn();
    const pinFocus = vi.fn();
    section.focus = sectionFocus;
    pin("south").focus = pinFocus;
    await click(reset());
    expect(pin("south").getAttribute("disabled")).not.toBeNull();
    expect(sectionFocus).toHaveBeenCalledOnce();
    expect(pinFocus).not.toHaveBeenCalled();
  });

  it("clicking the selected pin again clears the region", async () => {
    await show(<Harness initial="north" />);
    await click(pin("north"));
    expect(pin("north").getAttribute("aria-pressed")).toBe("false");
  });
});
