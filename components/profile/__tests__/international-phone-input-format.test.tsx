import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { InternationalPhoneInput } from "@/components/profile/international-phone-input";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

describe("InternationalPhoneInput formatting", () => {
  it.each([
    { country: "Malaysia", value: "+60143882368", dialCode: "+60", display: "14 388 2368" },
    { country: "Malaysia 9-digit mobile", value: "+60177143951", dialCode: "+60", display: "17 714 3951" },
    { country: "Malaysia 10-digit mobile", value: "+601123456789", dialCode: "+60", display: "11 2345 6789" },
    { country: "United States", value: "+12025550142", dialCode: "+1", display: "202 555 0142" },
    { country: "United Kingdom", value: "+442079460123", dialCode: "+44", display: "20 7946 0123" },
    { country: "Singapore", value: "+6581234567", dialCode: "+65", display: "8123 4567" },
    { country: "China", value: "+8613812345678", dialCode: "+86", display: "138 1234 5678" },
    { country: "Japan", value: "+819012345678", dialCode: "+81", display: "90 1234 5678" },
    { country: "India", value: "+919876543210", dialCode: "+91", display: "98765 43210" },
    { country: "Australia", value: "+61412345678", dialCode: "+61", display: "412 345 678" },
  ])("formats $country numbers using its national grouping", ({ value, dialCode, display }) => {
    const html = renderToStaticMarkup(
      <InternationalPhoneInput id="contact-phone" value={value} onChange={vi.fn()} />,
    );

    expect(html).toContain(`<span>${dialCode}</span>`);
    expect(html).toContain(`value="${display}"`);
  });
});
