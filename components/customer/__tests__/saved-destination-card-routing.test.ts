import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  resolve(process.cwd(), "components/customer/saved-destination-card.tsx"),
  "utf8",
);

describe("saved destination card routing", () => {
  it("uses the shared destination detail path for every saved destination", () => {
    expect(source).toContain("destinationHref");
    expect(source).toContain("destinationHref(destination.state)");
    expect(source.match(/href={destinationPath}/g)).toHaveLength(2);
    expect(source).not.toContain("/customer?state=");
  });
});
