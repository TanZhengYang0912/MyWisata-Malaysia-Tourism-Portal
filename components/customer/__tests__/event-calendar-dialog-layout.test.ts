import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  resolve(process.cwd(), "components/customer/event-calendar-dialog.tsx"),
  "utf8",
);

describe("event calendar dialog layout", () => {
  it("keeps the calendar dialog wider than the shared small-dialog default on desktop", () => {
    expect(source).toContain("sm:!max-w-[1180px]");
  });
});
