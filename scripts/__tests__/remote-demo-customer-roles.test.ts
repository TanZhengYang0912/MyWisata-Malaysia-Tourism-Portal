import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const seedSource = readFileSync(
  resolve(process.cwd(), "scripts/seed-remote-demo.mjs"),
  "utf8",
);

describe("remote demo customer roles", () => {
  it("creates a global customer assignment for every fixed customer demo identity", () => {
    expect(seedSource).toContain("'customer'");
    expect(seedSource).toContain("roleByName.customer");
    expect(seedSource).toContain("...CUSTOMER_IDS.map");
  });
});
