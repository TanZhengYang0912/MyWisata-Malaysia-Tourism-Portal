import { describe, expect, it } from "vitest";
import { classifyIntent, splitQuestions } from "../intent";

describe("classifyIntent", () => {
  it("classifies plain greetings", () => {
    expect(classifyIntent("hi")).toBe("greeting");
    expect(classifyIntent("Hello!")).toBe("greeting");
    expect(classifyIntent("hey there")).toBe("greeting");
    expect(classifyIntent("good morning")).toBe("greeting");
    expect(classifyIntent("selamat pagi")).toBe("greeting");
  });

  it("classifies plain chitchat", () => {
    expect(classifyIntent("thanks")).toBe("chitchat");
    expect(classifyIntent("thank you")).toBe("chitchat");
    expect(classifyIntent("ok")).toBe("chitchat");
    expect(classifyIntent("bye")).toBe("chitchat");
    expect(classifyIntent("lol")).toBe("chitchat");
  });

  it("does not treat a greeting that continues into a real question as a greeting", () => {
    expect(classifyIntent("hi, how do I book a tour")).toBe("question");
  });

  it("classifies short, non-greeting input as unclear", () => {
    expect(classifyIntent("how")).toBe("unclear");
    expect(classifyIntent("book tour")).toBe("unclear");
    expect(classifyIntent("")).toBe("unclear");
    expect(classifyIntent("???")).toBe("unclear");
  });

  it("classifies real questions as question", () => {
    expect(classifyIntent("how do I withdraw my money")).toBe("question");
    expect(classifyIntent("is the tour wheelchair accessible")).toBe("question");
    expect(classifyIntent("where do I see my orders")).toBe("question");
  });

  // CLAUDE-P4-EXTRAS.md Extra 1: Chinese has no spaces, so the word-count
  // heuristics above would have classified every Chinese question — no
  // matter how substantive — as "unclear" (it's a single "word" with no
  // spaces to split on). This is the regression test for that fix.
  it("classifies Chinese greetings and chitchat", () => {
    expect(classifyIntent("你好")).toBe("greeting");
    expect(classifyIntent("嗨")).toBe("greeting");
    expect(classifyIntent("谢谢")).toBe("chitchat");
    expect(classifyIntent("再见")).toBe("chitchat");
  });

  it("classifies a real Chinese question as question, not unclear", () => {
    expect(classifyIntent("我要怎么提现？")).toBe("question");
    expect(classifyIntent("这个行程可以轮椅出行吗")).toBe("question");
  });

  it("classifies a bare punctuation-only Chinese message as unclear", () => {
    expect(classifyIntent("？")).toBe("unclear");
  });
});

describe("splitQuestions", () => {
  it("leaves a single question untouched", () => {
    expect(splitQuestions("How do I withdraw my earnings?")).toEqual(["How do I withdraw my earnings?"]);
    expect(splitQuestions("how do I withdraw and how long does it take")).toEqual(["how do I withdraw and how long does it take"]);
  });

  it("splits on question marks, full-width question marks and line breaks", () => {
    expect(splitQuestions("How do I withdraw my earnings? Can I cancel a booking?")).toEqual([
      "How do I withdraw my earnings",
      "Can I cancel a booking",
    ]);
    expect(splitQuestions("怎么提现我的收入？可以取消预订吗？")).toEqual(["怎么提现我的收入", "可以取消预订吗"]);
    expect(splitQuestions("How do I withdraw my earnings\nCan I cancel a booking")).toEqual([
      "How do I withdraw my earnings",
      "Can I cancel a booking",
    ]);
  });

  it("drops greetings and filler, and returns the whole message when one question remains", () => {
    expect(splitQuestions("Hi? How do I withdraw my earnings? thanks")).toEqual(["Hi? How do I withdraw my earnings? thanks"]);
  });

  it("keeps at most three questions", () => {
    expect(splitQuestions("How do I withdraw money? Can I cancel a booking? Where is my voucher code? How do refunds work?")).toHaveLength(3);
  });
});
