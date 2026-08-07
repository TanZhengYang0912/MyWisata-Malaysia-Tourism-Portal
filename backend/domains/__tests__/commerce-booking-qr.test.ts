import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(resolve(process.cwd(), "backend/domains/commerce.ts"), "utf8");

describe("customer booking QR data", () => {
  it("does not consume the legacy demo QR column", () => {
    expect(source).not.toContain("demo_qr_code");
    expect(source).toContain("qrCode: row.id");
  });
});
