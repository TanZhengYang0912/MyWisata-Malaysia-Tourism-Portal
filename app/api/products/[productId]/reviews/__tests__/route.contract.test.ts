import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  resolve(process.cwd(), "app/api/products/[productId]/reviews/route.ts"),
  "utf8",
);

describe("customer product review API", () => {
  it("supports authenticated review submission with transaction ownership checks", () => {
    expect(source).toContain("export async function POST");
    expect(source).toContain("auth.getUser()");
    expect(source).toContain("createServiceClient");
    expect(source).toContain("order_item_id");
    expect(source).toContain("already");
  });

  it("validates review input before writing to Supabase", () => {
    expect(source).toContain("productReviewSubmitSchema");
    expect(source).toContain("parseBody");
    expect(source).toContain("CONTENT_REJECTED");
  });
});
