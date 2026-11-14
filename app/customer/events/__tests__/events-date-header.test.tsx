import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

const i18n = { resolvedLanguage: "en" };
vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key: string) => key, i18n }) }));

import { EventsDateHeader } from "@/app/customer/events/events-date-header";

const render = (hasEvents: (day: string) => boolean = () => true) =>
  renderToStaticMarkup(<EventsDateHeader day="2026-11-13" today="2026-11-13" hasEvents={hasEvents} onSelect={vi.fn()} />);

describe("EventsDateHeader", () => {
  it("writes the chosen day as the heading: weekday, day, short month", () => {
    i18n.resolvedLanguage = "en";
    expect(render()).toContain(">Friday 13 Nov</h1>");
    i18n.resolvedLanguage = "ms";
    expect(render()).toContain(">Jumaat 13 Nov</h1>");
    i18n.resolvedLanguage = "en";
  });

  it("shows five days with the chosen one in the middle", () => {
    const pressed = [...render().matchAll(/aria-pressed="(true|false)"/g)].map((match) => match[1]);
    expect(pressed).toEqual(["false", "false", "true", "false", "false"]);
    expect(render()).toContain('aria-label="Wednesday, November 11"');
  });

  it("hides the event dot on days without events", () => {
    const markup = render((day) => day === "2026-11-13");
    expect(markup.match(/size-\[5px\][^"]*invisible/g)).toHaveLength(4);
  });

  it("names the calendar and day-step buttons", () => {
    const markup = render();
    expect(markup).toContain('aria-label="ui.promotionCampaigns.datePicker.openCalendar"');
    expect(markup).toContain('aria-expanded="false"');
    expect(markup).toContain('aria-label="ui.promotionCampaigns.datePicker.previousDay"');
    expect(markup).toContain('aria-label="ui.promotionCampaigns.datePicker.nextDay"');
  });
});
