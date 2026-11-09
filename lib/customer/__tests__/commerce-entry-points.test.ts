import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const globalSearchSource = readFileSync(resolve(process.cwd(), "components/search/global-search.tsx"), "utf8");
const destinationSource = readFileSync(resolve(process.cwd(), "app/customer/destination/[destinationId]/page.tsx"), "utf8");

describe("customer commerce entry points", () => {
  it("routes global-search experiences through the outlet-aware activity detail", () => {
    expect(globalSearchSource).toContain("/customer/products/${exp.id}");
    expect(globalSearchSource).not.toContain("/customer/experience/${exp.id}");
  });

  it("routes destination products through the outlet-aware activity detail", () => {
    expect(destinationSource).toContain("<ProductCard");
    expect(destinationSource).not.toContain("/customer/experience/${product.id}");
    expect(readFileSync(resolve(process.cwd(), "components/customer/product-card.tsx"), "utf8")).toContain("buildProductPath(product.id");
  });
});
