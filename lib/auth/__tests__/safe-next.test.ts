import { describe, expect, it } from "vitest";
import { safeNext } from "@/lib/auth/safe-next";

describe("safeNext", () => {
  it("keeps local routes", () => expect(safeNext("/customer/profile")).toBe("/customer/profile"));
  it("rejects external and protocol-relative routes", () => {
    expect(safeNext("https://attacker.example")).toBe("/customer/explore");
    expect(safeNext("//attacker.example")).toBe("/customer/explore");
  });
});
