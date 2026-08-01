import { describe, expect, it } from "vitest";
import { detectLanguage } from "../language";

describe("detectLanguage", () => {
  it("detects English", () => {
    expect(detectLanguage("how do I withdraw my earnings?")).toBe("en");
  });

  it("detects Bahasa Melayu", () => {
    expect(detectLanguage("macam mana nak keluarkan duit saya?")).toBe("bm");
  });

  it("detects Chinese from Han script alone, regardless of BM/English markers", () => {
    expect(detectLanguage("我要怎么提现？")).toBe("zh");
  });

  it("detects the dominant language in a rojak (mixed) message", () => {
    expect(detectLanguage("boleh tak I withdraw my earnings?")).toBe("bm");
  });

  it("does not misfire on a single stray token in an otherwise-English sentence", () => {
    expect(detectLanguage("Ada is my favourite guide on this specific tour package")).toBe("en");
  });

  // Live-caught: intent.ts's GREETING_PHRASES recognizes "selamat pagi" as a
  // BM greeting, but the first version of BM_MARKERS above had no overlap
  // with either word, so it silently defaulted to 'en' and showed the
  // English greeting reply for a Malay greeting.
  it("detects BM greetings, matching intent.ts's GREETING_PHRASES", () => {
    expect(detectLanguage("selamat pagi")).toBe("bm");
    expect(detectLanguage("hai")).toBe("bm");
  });
});
