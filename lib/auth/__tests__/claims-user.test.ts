import { describe, expect, it } from "vitest";
import { getClaimsUserId } from "../claims-user";

function dbWith(getClaims: () => Promise<unknown>) {
  return { auth: { getClaims } } as never;
}

describe("getClaimsUserId", () => {
  it("returns the verified subject", async () => {
    expect(await getClaimsUserId(dbWith(async () => ({ data: { claims: { sub: "user-1" } }, error: null })))).toBe("user-1");
  });

  it.each([
    ["no session", async () => ({ data: { claims: null }, error: null })],
    ["an auth error", async () => ({ data: null, error: new Error("invalid JWT") })],
    ["an empty subject", async () => ({ data: { claims: { sub: "" } }, error: null })],
    ["a thrown verification error", async () => { throw new Error("Invalid alg claim"); }],
  ])("treats %s as signed out", async (_label, getClaims) => {
    expect(await getClaimsUserId(dbWith(getClaims))).toBeNull();
  });
});
