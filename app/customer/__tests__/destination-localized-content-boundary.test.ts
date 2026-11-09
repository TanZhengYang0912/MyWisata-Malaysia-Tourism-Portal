import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const pageSource = readFileSync(
  resolve(process.cwd(), "app/customer/destination/[destinationId]/page.tsx"),
  "utf8",
);

describe("destination localized content server boundary", () => {
  it("passes only serializable product data to the client ProductCard, which owns the localized title", () => {
    expect(pageSource).toContain("<ProductCard key={product.id} listing={product}");
    expect(pageSource).not.toContain("{({ text, control }) =>");
  });
});
