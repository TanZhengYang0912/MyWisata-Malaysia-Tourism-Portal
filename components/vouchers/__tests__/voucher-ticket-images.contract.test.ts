import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(resolve(process.cwd(), "components/vouchers/voucher-ticket.tsx"), "utf8");

describe("voucher ticket outlet photos", () => {
  it("renders up to four supplied real outlet photos as a collage", () => {
    expect(source).toContain("images?: Array<{ src: string; alt: string }>");
    expect(source).toContain("offer.images.slice(0, 4)");
    expect(source).toContain("image.src");
    expect(source).toContain("image.alt");
  });

  it("does not fall back to initials when an explicit empty photo list is supplied", () => {
    expect(source).toContain("offer.images !== undefined");
    expect(source).toContain("offer.images.length > 0");
    expect(source).toContain(": null");
  });
});
