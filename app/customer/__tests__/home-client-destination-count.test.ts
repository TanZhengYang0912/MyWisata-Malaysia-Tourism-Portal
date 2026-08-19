import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const homeSource = readFileSync(
  resolve(process.cwd(), "app/customer/home-client.tsx"),
  "utf8",
);

describe("customer home destination count", () => {
  it("uses the shared destination source for the state selector summary", () => {
    expect(homeSource).toContain('MALAYSIA_DESTINATIONS } from "@/lib/customer/malaysia-destinations";');
    expect(homeSource).toContain("{MALAYSIA_DESTINATIONS.length} destinations across Malaysia");
    expect(homeSource).not.toContain("17 destinations across Malaysia");
  });
});
