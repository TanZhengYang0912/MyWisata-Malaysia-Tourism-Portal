import React, { act } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { findElements, findOne, installTestDom, TestEvent, type TestDocument, type TestElement } from "@/components/shared/__tests__/render-test-dom";
import type { OperatingHours } from "@/backend/core/types";

vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key: string) => key, i18n: { resolvedLanguage: "en" } }) }));

import { placeTrackLabels, VendorOperatingHours } from "@/components/customer/vendor-operating-hours";

const hours: OperatingHours = {
  mon: { open: "09:00", close: "17:00" },
  tue: { closed: true },
  thu: { open: "09:00", close: "17:00" },
  fri: { periods: [{ open: "09:00", close: "12:30" }, { open: "14:30", close: "18:00" }] },
  sat: { open: "11:00", close: "11:30" },
  sun: { open: "22:00", close: "02:00" },
};

let createRoot: typeof import("react-dom/client").createRoot;
let document: TestDocument;
let container: TestElement;
let root: ReturnType<typeof import("react-dom/client").createRoot>;

async function render(element: React.ReactElement) {
  await act(async () => { root.render(element); });
}
const dot = (day: string) => findOne(container, (element) => element.tagName === "BUTTON" && element.getAttribute("aria-label")?.startsWith(day) === true);
const labels = () => findElements(container, (element) => element.hasAttribute("data-hours-label-row"));
async function select(day: string) {
  await act(async () => { dot(day).dispatchEvent(new TestEvent("click", { bubbles: true })); });
}

describe("VendorOperatingHours", () => {
  beforeAll(async () => {
    document = installTestDom();
    ({ createRoot } = await import("react-dom/client"));
    vi.useFakeTimers({ toFake: ["Date"] });
    // Monday 2 November 2026, 10:00 in Malaysia.
    vi.setSystemTime(new Date("2026-11-02T02:00:00Z"));
  });
  afterAll(() => vi.useRealTimers());
  beforeEach(() => { container = document.createElement("div"); document.body.appendChild(container); root = createRoot(container as unknown as Element); });
  afterEach(() => { act(() => root.unmount()); document.body.removeChild(container); });

  it("selects no day in the server HTML", () => {
    const markup = renderToStaticMarkup(<VendorOperatingHours hours={hours} />);
    expect(markup).not.toContain('aria-pressed="true"');
    expect(markup).not.toContain("data-hours-segment");
  });

  it("colours each day open, closed or unknown and selects today after mount", async () => {
    await render(<VendorOperatingHours hours={hours} />);
    const states = findElements(container, (element) => element.hasAttribute("data-hours-dot")).map((element) => element.getAttribute("data-hours-dot"));
    expect(states).toEqual(["open", "closed", "unknown", "open", "open", "open", "open"]);
    expect(dot("Monday").getAttribute("aria-pressed")).toBe("true");
    expect(dot("Wednesday").getAttribute("aria-label")).toBe("Wednesday: ui.operatingHours.unavailable");
  });

  it("draws the selected day's periods with a label at each open and close time only", async () => {
    await render(<VendorOperatingHours hours={hours} />);
    await select("Friday");
    expect(dot("Friday").getAttribute("aria-pressed")).toBe("true");
    expect(findElements(container, (element) => element.hasAttribute("data-hours-segment"))).toHaveLength(2);
    expect(labels().map((label) => label.textContent)).toEqual(["09:00", "12:30", "14:30", "18:00"]);
  });

  it("moves a crowded label to the second row and never labels midnight", async () => {
    await render(<VendorOperatingHours hours={hours} />);
    await select("Saturday");
    expect(labels().map((label) => [label.textContent, label.getAttribute("data-hours-label-row")])).toEqual([["11:00", "1"], ["11:30", "2"]]);
    await select("Sunday");
    expect(labels().map((label) => label.textContent)).toEqual(["22:00"]);
    // Sunday night runs on into Monday, which starts with a 00:00–02:00 stretch.
    await select("Monday");
    expect(labels().map((label) => label.textContent)).toEqual(["02:00", "09:00", "17:00"]);
  });

  it("hatches a closed day and falls back to the schedule note without hours", async () => {
    await render(<VendorOperatingHours hours={hours} />);
    await select("Tuesday");
    expect(findOne(container, (element) => element.hasAttribute("data-hours-track")).getAttribute("data-hours-track")).toBe("closed");
    expect(renderToStaticMarkup(<VendorOperatingHours hours={null} />)).toContain("ui.vendor.checkSchedule");
  });

  it("skips a label that would crowd both rows", () => {
    expect(placeTrackLabels([600, 620, 640]).map((label) => label.row)).toEqual([1, 2]);
  });
});
