import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string, options?: Record<string, unknown>) => (options?.note ? `${key}:${options.note}` : key), i18n: { language: "en", resolvedLanguage: "en" } }),
}));

import { HotelProfileForm, type HotelProfileFormData } from "../hotel-profile-editor";

const data: HotelProfileFormData = {
  isHotel: true,
  live: { about: "A resort.", amenityCodes: ["wifi"], checkInTime: "15:00", checkOutTime: "12:00", policies: "No pets.", photos: [] },
  pending: null,
  lastRejection: null,
  amenities: [
    { code: "wifi", label_en: "Free Wi-Fi", label_ms: "Wi-Fi percuma", label_zh: "免费 Wi-Fi", icon: "wifi" },
    { code: "swimming_pool", label_en: "Swimming pool", label_ms: "Kolam renang", label_zh: "游泳池", icon: "waves" },
  ],
};
const render = (overrides: Partial<HotelProfileFormData>) => renderToStaticMarkup(
  <HotelProfileForm data={{ ...data, ...overrides }} saving={false} uploading={false} onSubmit={() => undefined} onUpload={() => undefined} />,
);

describe("hotel profile editor", () => {
  it("shows one checkbox per active amenity, in the viewer's language", () => {
    const markup = render({});
    expect(markup).toContain("Free Wi-Fi");
    expect(markup).toContain("Swimming pool");
    expect(markup.match(/role="checkbox"/g)).toHaveLength(2);
  });

  it("tells the vendor a pending edit keeps the hotel live", () => {
    const markup = render({ pending: { ...data.live, about: "Updated." } });
    expect(markup).toContain("hotelProfile.status.pending");
    expect(markup).toContain("Updated.");
  });

  it("shows the admin's note after a rejection", () => {
    expect(render({ lastRejection: { note: "Please add real photos", reviewedAt: "2026-10-18" } })).toContain("hotelProfile.status.rejected:Please add real photos");
  });

  it("groups profile fields and keeps the review action reachable on a phone", () => {
    const markup = render({});

    expect(markup.match(/<section class="rounded-2xl border border-border bg-card p-4 sm:p-5">/g)).toHaveLength(3);
    expect(markup).toContain("sticky bottom-0");
    expect(markup).toContain("safe-area-inset-bottom");
    expect(markup).toContain("min-h-11 w-full sm:w-auto");
    expect(markup).not.toContain("hotelProfile.description");
  });

  it("replaces the page builder with the hotel editor for hotels", () => {
    const page = readFileSync(resolve(process.cwd(), "app/vendor/outlets/page.tsx"), "utf8");
    expect(page.match(/<HotelProfileEditor/g)).toHaveLength(2);
    for (const block of page.split("<HotelProfileEditor").slice(1)) {
      expect(block.slice(0, block.indexOf("</HotelProfileEditor>"))).toContain("<OutletPageBuilder");
    }
  });
});
