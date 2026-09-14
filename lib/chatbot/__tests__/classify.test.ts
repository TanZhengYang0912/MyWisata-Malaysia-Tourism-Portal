import { describe, expect, it } from "vitest";
import { classifyTicket, TICKET_CATEGORIES } from "../classify";

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

  it("classifies a KYC question", () => {
    expect(classifyTicket("My KYC verification keeps failing, can you verify my identity manually?")).toBe("kyc");
  });

  it("classifies a technical question", () => {
    expect(classifyTicket("The app keeps showing an error and the page is frozen after I tap crash report")).toBe("technical");
  });

  it("falls back to general for an unrelated question", () => {
    expect(classifyTicket("Is the tour wheelchair accessible?")).toBe("general");
  });

  it("falls back to general for empty text", () => {
    expect(classifyTicket("")).toBe("general");
  });

  // CLAUDE-P4-EXTRAS-2.md follow-up: TICKET_CATEGORIES is the single source
  // of truth the admin chatbot KB form's category dropdown reads from
  // (app/admin/chatbot/page.tsx) — if a category is ever added to (or
  // removed from) the classifier's real output set without updating that
  // exported array, this test catches the drift before the dropdown does.
  it("TICKET_CATEGORIES covers every value classifyTicket() can return", () => {
    const sample = ["withdraw", "book", "pay", "vendor", "affiliate", "kyc", "crash", "unrelated gibberish"];
    for (const text of sample) {
      expect(TICKET_CATEGORIES).toContain(classifyTicket(text));
    }
  });
});
