import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(resolve(process.cwd(), "components/customer/booking-day-drawer.tsx"), "utf8");

describe("booking day drawer contract", () => {
  it("provides an accessible dialog with a close action and booking links", () => {
    expect(source).toContain('role="dialog"');
    expect(source).toContain('aria-modal="true"');
    expect(source).toContain('aria-labelledby="booking-day-drawer-title"');
    expect(source).toContain('aria-label="Close booking list"');
    expect(source).toContain('href={`/customer/orders/${booking.orderId}`}');
  });

  it("supports Escape and restores focus after closing", () => {
    expect(source).toContain('event.key === "Escape"');
    expect(source).toContain('event.key !== "Tab"');
    expect(source).toContain("event.preventDefault()");
    expect(source).toContain("previousActiveElement?.focus()");
  });

  it("uses the centered modal presentation shared by the review flows", () => {
    expect(source).toContain("items-center justify-center");
    expect(source).toContain("max-h-[min(780px,calc(100vh-2rem))]");
    expect(source).not.toContain("inset-y-0 right-0");
  });
});
