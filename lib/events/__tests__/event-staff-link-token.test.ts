import { describe, expect, it } from "vitest";
import { signEventStaffLinkToken, verifyEventStaffLinkToken } from "@/lib/events/event-staff-link-token";

const SECRET = "event-staff-link-test-secret";
const LINK_ID = "5f2c9a41-7e0b-4c1d-9a2e-3b8d6f1c0e77";
const OTHER_ID = "6a3d0b52-8f1c-4d2e-8b3f-4c9e7a2d1f88";

describe("event staff link token", () => {
  it("round-trips the link id", () => {
    const token = signEventStaffLinkToken(LINK_ID, SECRET);
    expect(token.startsWith(`esl1.${LINK_ID}.`)).toBe(true);
    expect(verifyEventStaffLinkToken(token, SECRET)).toEqual({ linkId: LINK_ID });
  });

  it("rejects a token whose link id was swapped", () => {
    const [, , mac] = signEventStaffLinkToken(LINK_ID, SECRET).split(".");
    expect(verifyEventStaffLinkToken(`esl1.${OTHER_ID}.${mac}`, SECRET)).toBeNull();
  });

  it("rejects a tampered signature", () => {
    const token = signEventStaffLinkToken(LINK_ID, SECRET);
    // Flip a middle MAC character: the last base64url character carries padding bits.
    const at = token.length - 10;
    const flipped = token.slice(0, at) + (token[at] === "A" ? "B" : "A") + token.slice(at + 1);
    expect(verifyEventStaffLinkToken(flipped, SECRET)).toBeNull();
  });

  it("rejects a token signed with another secret", () => {
    expect(verifyEventStaffLinkToken(signEventStaffLinkToken(LINK_ID, "other-secret"), SECRET)).toBeNull();
  });

  it("rejects a wrong prefix, a non-uuid id and malformed input", () => {
    const [, , mac] = signEventStaffLinkToken(LINK_ID, SECRET).split(".");
    expect(verifyEventStaffLinkToken(`evt1.${LINK_ID}.${mac}`, SECRET)).toBeNull();
    expect(verifyEventStaffLinkToken(`esl1.not-a-uuid.${mac}`, SECRET)).toBeNull();
    expect(verifyEventStaffLinkToken("garbage", SECRET)).toBeNull();
    expect(verifyEventStaffLinkToken("", SECRET)).toBeNull();
  });
});
