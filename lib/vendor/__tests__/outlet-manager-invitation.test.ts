import { describe, expect, it } from "vitest";
import {
  buildOutletManagerInvitationLink,
  hashInvitationToken,
  normalizeInvitationEmail,
} from "@/lib/vendor/outlet-manager-invitation";

describe("outlet manager invitation helpers", () => {
  it("normalizes manager emails before storage and comparison", () => {
    expect(normalizeInvitationEmail("  Manager@Example.COM ")).toBe("manager@example.com");
  });

  it("hashes tokens deterministically without exposing the raw token", () => {
    const token = "one-time-secret-token";
    const hash = hashInvitationToken(token);
    expect(hash).toHaveLength(64);
    expect(hash).not.toContain(token);
    expect(hashInvitationToken(token)).toBe(hash);
  });

  it("builds an invitation link for the public acceptance page", () => {
    expect(buildOutletManagerInvitationLink("https://mywisata.test", "abc123"))
      .toBe("https://mywisata.test/outlet-manager-invitations/abc123");
  });
});
