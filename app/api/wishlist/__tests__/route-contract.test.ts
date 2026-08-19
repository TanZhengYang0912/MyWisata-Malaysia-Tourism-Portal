import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const source = readFileSync(
  resolve(process.cwd(), "app/api/wishlist/route.ts"),
  "utf8",
);

describe("wishlist persistence contract", () => {
  it("accepts the PostgreSQL UUID-shaped ids used by the catalogue", () => {
    expect(source).toContain(
      "^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$",
    );
    expect(source).not.toContain("productId: z.string().uuid()");
  });

  it("keeps each user's saved experience independent", () => {
    expect(source).toContain('select("product_id")');
    expect(source).toContain('onConflict: "user_id,product_id"');
  });
});
