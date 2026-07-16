import { describe, expect, it } from "vitest";
import { PROFILE_SECTION_IDS, canResubmitKyc } from "@/lib/profile/display";

describe("completed profile sections", () => {
  it("keeps the approved section order", () => {
    expect(PROFILE_SECTION_IDS).toEqual(["personal", "contact", "verification", "preferences", "danger"]);
  });

  it("only offers KYC resubmission after rejection", () => {
    expect(canResubmitKyc("rejected")).toBe(true);
    expect(canResubmitKyc("pending")).toBe(false);
    expect(canResubmitKyc("approved")).toBe(false);
  });
});
