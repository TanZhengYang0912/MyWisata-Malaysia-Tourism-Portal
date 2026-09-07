import { describe, expect, it } from "vitest";
import {
  buildStaffInvitationUrl,
  createStaffInvitationToken,
  hashStaffInvitationToken,
  normalizeStaffInvitationEmail,
  staffInvitationOrigin,
} from "@/lib/staff-invitations/server";

describe("staff invitation server helpers", () => {
  it("normalizes only whitespace and case", () => {
    expect(normalizeStaffInvitationEmail("  First.Last+ops@GMAIL.com  ")).toBe("first.last+ops@gmail.com");
  });

  it("creates independent 32-byte hexadecimal secrets and SHA-256 hashes", () => {
    const first = createStaffInvitationToken();
    const second = createStaffInvitationToken();
    expect(first).toMatch(/^[0-9a-f]{64}$/);
    expect(second).toMatch(/^[0-9a-f]{64}$/);
    expect(second).not.toBe(first);
    expect(hashStaffInvitationToken("invite-secret")).toBe(
      "2a1ed5f04ebb12c50d33ea3031b46260a6d503e72c1d992b2fd3d9e048cd5c8f",
    );
  });

  it("requires a configured trusted origin", () => {
    expect(() => staffInvitationOrigin({})).toThrow("NEXT_PUBLIC_SITE_URL");
    expect(() => staffInvitationOrigin({ NEXT_PUBLIC_SITE_URL: "https://mywisata.example/path" })).toThrow("origin");
    expect(() => staffInvitationOrigin({ NEXT_PUBLIC_SITE_URL: "http://mywisata.example" })).toThrow("HTTPS");
  });

  it("reuses the existing trusted application origin when the dedicated setting is absent", () => {
    expect(staffInvitationOrigin({ NEXT_PUBLIC_APP_URL: "http://localhost:3000" })).toBe(
      "http://localhost:3000",
    );
  });

  it("allows HTTPS and local HTTP, then builds an encoded link", () => {
    expect(staffInvitationOrigin({ NEXT_PUBLIC_SITE_URL: "https://staff.mywisata.test/" })).toBe(
      "https://staff.mywisata.test",
    );
    expect(staffInvitationOrigin({ NEXT_PUBLIC_SITE_URL: "http://localhost:3000" })).toBe(
      "http://localhost:3000",
    );
    expect(buildStaffInvitationUrl("https://staff.mywisata.test", "a/b+c")).toBe(
      "https://staff.mywisata.test/staff-invitations/a%2Fb%2Bc",
    );
  });
});
