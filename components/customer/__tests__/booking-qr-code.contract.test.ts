import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const componentSource = readFileSync(
  resolve(process.cwd(), "components/customer/booking-qr-code.tsx"),
  "utf8",
);

const locales = ["en", "zh-CN", "ms"] as const;

describe("customer booking QR enlarge interaction", () => {
  it("offers an accessible button and shared dialog with a crisp enlarged QR", () => {
    expect(componentSource).toContain("DialogContent");
    expect(componentSource).toContain('aria-label={t("ui.booking.qrEnlargeAction")}');
    expect(componentSource).toContain("QRCode.toDataURL");
    expect(componentSource).toContain("width: 320");
    expect(componentSource).toContain("buildBookingQrPayload(bookingId, window.location.origin, liveToken)");
    expect(componentSource).toContain("liveToken && enlargedQr?.token === liveToken ? enlargedQr.dataUrl : undefined");
    expect(componentSource).toContain("if (!ticket) return;");
    expect(componentSource).not.toContain("setLiveToken(ticket?.passToken)");
  });

  it("provides translated enlarge instructions and accessible dialog copy", () => {
    for (const locale of locales) {
      const copy = JSON.parse(readFileSync(
        resolve(process.cwd(), `app/i18n/locales/${locale}/customer.json`),
        "utf8",
      )) as { ui: { booking: Record<string, string> } };

      expect(copy.ui.booking.qrEnlargeAction).toBeTruthy();
      expect(copy.ui.booking.qrEnlargeDescription).toBeTruthy();
    }
  });
});
