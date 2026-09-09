import { describe, expect, it } from "vitest";

import {
  isInvalidDateTimeRange,
  malaysiaDateTimeLocalToIso,
} from "@/lib/datetime/malaysia";

describe("Malaysia date-time helpers", () => {
  it("converts Malaysia wall time to a timezone-independent ISO timestamp", () => {
    expect(malaysiaDateTimeLocalToIso("2026-09-18T11:25")).toBe("2026-09-18T03:25:00.000Z");
    expect(malaysiaDateTimeLocalToIso("2026-09-18T11:25:30")).toBe("2026-09-18T03:25:30.000Z");
  });

  it("rejects malformed and impossible local date-time values", () => {
    expect(() => malaysiaDateTimeLocalToIso("not-a-date")).toThrow(RangeError);
    expect(() => malaysiaDateTimeLocalToIso("2026-02-30T11:25")).toThrow(RangeError);
  });

  it("marks only complete equal or reversed ranges as invalid", () => {
    expect(isInvalidDateTimeRange("2026-09-18T11:25", "")).toBe(false);
    expect(isInvalidDateTimeRange("2026-09-18T11:25", "2026-09-18T11:25")).toBe(true);
    expect(isInvalidDateTimeRange("2026-09-18T11:25", "2026-09-18T11:24")).toBe(true);
    expect(isInvalidDateTimeRange("2026-09-18T11:25", "2026-09-18T11:26")).toBe(false);
  });
});
