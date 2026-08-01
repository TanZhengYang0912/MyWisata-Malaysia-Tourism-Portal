import { describe, expect, it } from "vitest";
import { classifyIntent } from "../intent";

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
