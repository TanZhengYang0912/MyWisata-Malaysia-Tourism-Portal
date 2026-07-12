import { describe, expect, it } from "vitest";
import { classifyTicket } from "../classify";

describe("classifyTicket", () => {
  it("classifies a withdrawal question", () => {
    expect(classifyTicket("How long does it take to withdraw money to my bank?")).toBe("withdrawal");
  });

  it("classifies a booking question", () => {
    expect(classifyTicket("I can't select a time slot to book this activity")).toBe("booking");
  });

  it("classifies a payment question", () => {
    expect(classifyTicket("My card was charged twice at checkout, I need a refund")).toBe("payment");
  });

  it("classifies a vendor question", () => {
    expect(classifyTicket("The vendor outlet listing has the wrong business hours")).toBe("vendor");
  });

  it("classifies an affiliate question", () => {
    expect(classifyTicket("My affiliate link commission didn't show up after a referral")).toBe("affiliate");
  });

  it("falls back to general for an unrelated question", () => {
    expect(classifyTicket("Is the tour wheelchair accessible?")).toBe("general");
  });

  it("falls back to general for empty text", () => {
    expect(classifyTicket("")).toBe("general");
  });
});
