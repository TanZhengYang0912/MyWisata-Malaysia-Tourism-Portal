import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const layoutSource = readFileSync(resolve(process.cwd(), "app/customer/layout.tsx"), "utf8");
const chatbotSource = readFileSync(resolve(process.cwd(), "components/shared/chatbot-widget.tsx"), "utf8");

describe("customer booking mobile overlays", () => {
  it("hides the floating support launcher on booking details at phone widths", () => {
    expect(layoutSource).toContain('const isBookingDetailRoute = /^\\/customer\\/bookings\\/[^/]+\\/?$/.test(pathname);');
    expect(layoutSource).toContain("|| isBookingDetailRoute");
    expect(layoutSource).toContain("<ChatbotWidget hideLauncherOnMobile={hideMobileChatLauncher} />");
    expect(chatbotSource).toContain('hideLauncherOnMobile ? "max-md:hidden" : ""');
  });
});
