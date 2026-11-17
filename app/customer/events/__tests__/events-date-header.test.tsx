import { act } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { findElements, findOne, installTestDom, TestEvent, type TestDocument, type TestElement } from "@/components/shared/__tests__/render-test-dom";

const i18n = { resolvedLanguage: "en" };
vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key: string, options?: { date?: string; count?: number }) => options?.date ? `${key} ${options.date} ${options.count}` : key, i18n }) }));

import { EventsDateFilter, headingFor } from "@/app/customer/events/events-date-header";

const TODAY = "2026-11-13";
// Mock counts: 10 events on 28 Nov, 2 on the 13th, 1 on the 12th (past), none otherwise.
const countOn = (day: string) => ({ "2026-11-28": 10, "2026-11-13": 2, "2026-11-12": 1 } as Record<string, number>)[day] ?? 0;

describe("EventsDateFilter markup", () => {
  it("writes a day heading as weekday, day, short month", () => {
    expect(headingFor("2026-11-13", "en")).toBe("Friday 13 Nov");
    expect(headingFor("2026-11-13", "ms")).toBe("Jumaat 13 Nov");
  });

  it("is only the calendar button when no date is chosen", () => {
    const markup = renderToStaticMarkup(<EventsDateFilter date={null} today={TODAY} countOn={countOn} onSelect={vi.fn()} />);
    expect(markup.match(/<button /g)).toHaveLength(1);
    expect(markup).toContain('aria-label="ui.promotionCampaigns.datePicker.openCalendar"');
    expect(markup).toContain('aria-expanded="false"');
  });

  it("shows ‹ the chosen day with its count › and the calendar; the day itself is not a button", () => {
    const markup = renderToStaticMarkup(<EventsDateFilter date="2026-11-28" today={TODAY} countOn={countOn} onSelect={vi.fn()} />);
    const labels = [...markup.matchAll(/<button [^>]*aria-label="([^"]+)"/g)].map((match) => match[1]);
    expect(labels).toEqual([
      "ui.promotionCampaigns.datePicker.previousDay",
      "ui.promotionCampaigns.datePicker.nextDay",
      "ui.promotionCampaigns.datePicker.openCalendar",
    ]);
    const block = markup.match(/<p aria-live="polite"[\s\S]*?<\/p>/)?.[0] ?? "";
    expect(block).toContain("ui.promotionCampaigns.datePicker.dayEvents Saturday, November 28 10");
    expect(block).toContain(">Sat<");
    expect(block).toContain(">28<");
    expect(block).toMatch(/bg-accent[^"]*text-primary[^"]*">10</);
    expect(markup).not.toContain(" disabled=\"\"");
  });

  it("disables the previous day on today", () => {
    const markup = renderToStaticMarkup(<EventsDateFilter date={TODAY} today={TODAY} countOn={countOn} onSelect={vi.fn()} />);
    expect(markup).toMatch(/<button type="button" disabled="" aria-label="ui\.promotionCampaigns\.datePicker\.previousDay"/);
  });
});

describe("EventsDateFilter calendar", () => {
  let createRoot: typeof import("react-dom/client").createRoot;
  let document: TestDocument;
  let container: TestElement;
  let root: ReturnType<typeof createRoot>;
  const onSelect = vi.fn();

  beforeAll(async () => {
    document = installTestDom();
    ({ createRoot } = await import("react-dom/client"));
  });

  beforeEach(() => {
    onSelect.mockReset();
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container as unknown as Element);
  });

  afterEach(() => {
    act(() => root.unmount());
    document.body.removeChild(container);
  });

  const open = async (date: string | null) => {
    await act(async () => {
      root.render(<EventsDateFilter date={date} today={TODAY} countOn={countOn} onSelect={onSelect} />);
    });
    await act(async () => {
      findOne(container, (element) => element.getAttribute("aria-label") === "ui.promotionCampaigns.datePicker.openCalendar").dispatchEvent(new TestEvent("click", { bubbles: true }));
    });
    return findOne(container, (element) => element.getAttribute("role") === "dialog");
  };
  const dayButton = (dialog: TestElement, label: string) => findOne(dialog, (element) => element.getAttribute("aria-label") === label);

  it("opens on today's month from the filter's right edge, with counts and past days disabled", async () => {
    const dialog = await open(null);
    expect(dialog.className).toContain("absolute right-0");
    expect(dialog.className).not.toMatch(/\bleft-0\b|lg:left-auto/);
    expect(dialog.textContent).toContain("November 2026");

    const past = dayButton(dialog, "Thursday, November 12, 2026");
    expect(past.getAttribute("disabled")).not.toBeNull();
    expect(past.textContent).toBe("12");
    expect(dayButton(dialog, "Friday, November 13, 2026").textContent).toBe("132");
    expect(dayButton(dialog, "Saturday, November 28, 2026").textContent).toBe("2810");
    expect(dayButton(dialog, "Sunday, November 29, 2026").textContent).toBe("29");

    const previousMonth = findOne(dialog, (element) => element.getAttribute("aria-label") === "ui.promotionCampaigns.datePicker.previousMonth");
    expect(previousMonth.getAttribute("disabled")).not.toBeNull();
  });

  it("has Today and no All dates in its footer", async () => {
    const dialog = await open(null);
    const footerButtons = findElements(dialog, (element) => element.tagName === "BUTTON" && !element.getAttribute("aria-label"));
    expect(footerButtons.map((button) => button.textContent)).toEqual(["ui.calendar.today"]);
    await act(async () => footerButtons[0].dispatchEvent(new TestEvent("click", { bubbles: true })));
    expect(onSelect).toHaveBeenCalledWith(TODAY);
  });

  it("picks a day, and tapping the chosen day again returns to all events", async () => {
    let dialog = await open(null);
    await act(async () => dayButton(dialog, "Saturday, November 28, 2026").dispatchEvent(new TestEvent("click", { bubbles: true })));
    expect(onSelect).toHaveBeenLastCalledWith("2026-11-28");

    dialog = await open("2026-11-28");
    const chosen = dayButton(dialog, "Saturday, November 28, 2026");
    expect(chosen.getAttribute("aria-pressed")).toBe("true");
    await act(async () => chosen.dispatchEvent(new TestEvent("click", { bubbles: true })));
    expect(onSelect).toHaveBeenLastCalledWith(null);
  });
});
