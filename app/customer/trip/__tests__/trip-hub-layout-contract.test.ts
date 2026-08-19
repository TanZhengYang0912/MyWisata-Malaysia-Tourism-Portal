import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const hubSource = readFileSync(new URL("../trip-hub-client.tsx", import.meta.url), "utf8");

describe("trip hub layout contract", () => {
  it("uses the shared customer page container and responsive heading scale", () => {
    expect(hubSource).toContain("mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8");
    expect(hubSource).toContain("text-3xl font-bold font-[family-name:var(--font-display)] text-foreground sm:text-4xl");
    expect(hubSource).not.toContain("max-w-5xl");
  });

  it("keeps the trip cards readable at wide desktop sizes", () => {
    expect(hubSource).toContain("grid gap-6 sm:grid-cols-2 lg:grid-cols-3");
    expect(hubSource).toContain("rounded-2xl border border-border bg-card p-6");
    expect(hubSource).toContain("text-xl font-bold text-foreground");
  });
});
