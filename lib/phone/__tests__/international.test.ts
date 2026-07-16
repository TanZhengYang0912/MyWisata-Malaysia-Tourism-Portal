import { describe, expect, it } from "vitest";
import { parseInternationalPhone } from "@/lib/phone/international";

describe("parseInternationalPhone", () => {
  it("canonicalizes valid Malaysian and US numbers", () => {
    expect(parseInternationalPhone("+60 17-714 3951")).toEqual({ ok: true, e164: "+60177143951" });
    expect(parseInternationalPhone("+1 202 555 0142")).toEqual({ ok: true, e164: "+12025550142" });
  });

  it("rejects local-only and impossible numbers", () => {
    expect(parseInternationalPhone("0177143951")).toEqual({ ok: false, message: "Enter a valid international phone number" });
    expect(parseInternationalPhone("+601")).toEqual({ ok: false, message: "Enter a valid international phone number" });
  });
});
