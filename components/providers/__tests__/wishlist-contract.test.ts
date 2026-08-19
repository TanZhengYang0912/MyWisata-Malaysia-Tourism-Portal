import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const wishlistProviderSource = readFileSync(
  resolve(process.cwd(), "components/providers/wishlist.tsx"),
  "utf8",
);
const savedDestinationsProviderSource = readFileSync(
  resolve(process.cwd(), "components/providers/saved-destinations.tsx"),
  "utf8",
);

describe("customer save providers contract", () => {
  it("keeps multiple experiences as independent saved ids", () => {
    expect(wishlistProviderSource).toContain("new Set");
    expect(wishlistProviderSource).toContain("next.add(productId)");
    expect(wishlistProviderSource).toContain('fetch("/api/wishlist"');
  });

  it("keeps multiple places as independent destination states", () => {
    expect(savedDestinationsProviderSource).toContain("new Set");
    expect(savedDestinationsProviderSource).toContain(
      "next.add(destinationState)",
    );
    expect(savedDestinationsProviderSource).toContain(
      'fetch("/api/saved-destinations"',
    );
  });
});
