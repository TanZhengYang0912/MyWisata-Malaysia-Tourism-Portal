import { describe, expect, it } from "vitest";
import { AVATAR_MAX_BYTES, validateAvatarBytes } from "@/lib/profile/avatar-validation";

describe("avatar validation", () => {
  it("accepts a JPEG signature", () => expect(validateAvatarBytes(new Uint8Array([0xff, 0xd8, 0xff, 0x00]), "image/jpeg")).toMatchObject({ ok: true }));
  it("rejects text masquerading as an image", () => expect(validateAvatarBytes(new TextEncoder().encode("not an image"), "image/jpeg")).toMatchObject({ ok: false }));
  it("rejects oversized files", () => expect(validateAvatarBytes(new Uint8Array(AVATAR_MAX_BYTES + 1), "image/png")).toMatchObject({ ok: false }));
});
