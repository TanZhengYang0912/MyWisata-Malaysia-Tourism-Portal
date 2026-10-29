import { describe, expect, it } from "vitest";
import { prepareExternalText, redactPII } from "../pii";

describe("redactPII", () => {
  it("redacts a dashed Malaysian IC", () => {
    const result = redactPII("my IC is 990101-14-5678, when's my withdrawal");
    expect(result.clean).toBe("my IC is [IC], when's my withdrawal");
    expect(result.found).toBe(true);
  });

  it("redacts a bare 12-digit IC", () => {
    const result = redactPII("IC: 990101145678");
    expect(result.clean).toBe("IC: [IC]");
    expect(result.found).toBe(true);
  });

  it("redacts a Malaysian mobile number", () => {
    expect(redactPII("call me at 012-3456789").clean).toBe("call me at [PHONE]");
    expect(redactPII("call me at +60123456789").clean).toBe("call me at [PHONE]");
  });

  it("redacts an email address", () => {
    const result = redactPII("reach me at alice@example.com please");
    expect(result.clean).toBe("reach me at [EMAIL] please");
    expect(result.found).toBe(true);
  });

  it("redacts a credit-card-like digit run", () => {
    const result = redactPII("card number 4111111111111111 expired");
    expect(result.clean).toBe("card number [CARD] expired");
    expect(result.found).toBe(true);
  });

  it("redacts a passport number", () => {
    const result = redactPII("passport A12345678 on file");
    expect(result.clean).toBe("passport [PASSPORT] on file");
    expect(result.found).toBe(true);
  });

  it("redacts multiple PII items in one message", () => {
    const result = redactPII("IC 990101-14-5678, email alice@example.com, phone 012-3456789");
    expect(result.clean).toBe("IC [IC], email [EMAIL], phone [PHONE]");
    expect(result.found).toBe(true);
  });

  it("leaves clean text untouched and reports found:false", () => {
    const result = redactPII("how do I withdraw my money");
    expect(result.clean).toBe("how do I withdraw my money");
    expect(result.found).toBe(false);
  });

  it("is reusable across calls (regex lastIndex does not leak state)", () => {
    redactPII("IC 990101-14-5678");
    const second = redactPII("how do I book a tour");
    expect(second.clean).toBe("how do I book a tour");
    expect(second.found).toBe(false);
  });

  it("blocks explicit Chinese identity/address details and address-like postal blocks", () => {
    expect(prepareExternalText("我的地址是槟城乔治市12号")).toEqual({ allowed: false });
    expect(prepareExternalText("我住在槟城乔治市12号")).toEqual({ allowed: false });
    expect(prepareExternalText("我叫张三")).toEqual({ allowed: false });
    expect(prepareExternalText("我的名字是张三")).toEqual({ allowed: false });
    expect(prepareExternalText("我叫John")).toEqual({ allowed: false });
    expect(prepareExternalText("我的名字是John Smith")).toEqual({ allowed: false });
    expect(prepareExternalText("身份证990101-14-5678")).toEqual({ allowed: false });
    expect(prepareExternalText("12 George Town, Penang 10250")).toEqual({ allowed: false });
    expect(prepareExternalText("Flat 3, George Town, Penang")).toEqual({ allowed: false });
    expect(prepareExternalText("槟城乔治市12号")).toEqual({ allowed: false });
    expect(prepareExternalText("George Town, Penang 10250")).toEqual({ allowed: false });
    expect(prepareExternalText("1234567")).toEqual({ allowed: false });
    expect(prepareExternalText("Is Flat White Cafe open in Kuala Lumpur?").allowed).toBe(true);
    expect(prepareExternalText("Visit Suite 101 at the mall").allowed).toBe(true);
    expect(prepareExternalText("Block 3 of the heritage museum").allowed).toBe(true);
    expect(prepareExternalText("Kuala Lumpur 50000 attractions").allowed).toBe(true);
  });

  it("does not send identified phone or bank data to an external model", () => {
    expect(prepareExternalText("The payout bank information does not match the review record.").allowed).toBe(true);
    expect(prepareExternalText("My bank account is 123456789012.")).toEqual({ allowed: false });
    expect(prepareExternalText("Call me at 012-3456789")).toEqual({ allowed: false });
    expect(prepareExternalText("Call me at +60123456789")).toEqual({ allowed: false });
    expect(prepareExternalText("Call me at 555-1234")).toEqual({ allowed: false });
    expect(prepareExternalText("Reach me at alice@example.com")).toEqual({ allowed: false });
    expect(prepareExternalText("Bank account: 123456")).toEqual({ allowed: false });
  });

  it("allows ordinary travel questions with prices, dates, people, and public places", () => {
    expect(prepareExternalText("Plan 3 days in Kuala Lumpur for 2 adults, 12–14 Nov 2026, with RM 800 for food and attractions.").allowed).toBe(true);
    expect(prepareExternalText("Family of 4, RM 1,200 for 5 days in Penang and Kuala Lumpur, 20–24 Dec 2026.").allowed).toBe(true);
    expect(prepareExternalText("Plan a 2-day trip to Penang from 2026-11-12 to 2026-11-14 for RM 600.").allowed).toBe(true);
    expect(prepareExternalText("Is Jalan Alor worth visiting during a 2-night Kuala Lumpur trip?").allowed).toBe(true);
  });
});
