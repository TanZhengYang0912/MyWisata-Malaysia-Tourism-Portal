import { describe, expect, it } from "vitest";
import { validatePassword } from "@/lib/auth/password-policy";

describe("password policy", () => {
  it("accepts the agreed 10-character policy", () => {
    expect(validatePassword("Abcdefghi1")).toEqual({ ok: true });
  });
  it("requires upper, lower, and digit", () => {
    expect(validatePassword("abcdefghi1")).toMatchObject({ ok: false });
    expect(validatePassword("ABCDEFGHI1")).toMatchObject({ ok: false });
    expect(validatePassword("Abcdefghij")).toMatchObject({ ok: false });
  });
});
