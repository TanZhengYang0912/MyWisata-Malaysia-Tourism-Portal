import { describe, expect, it } from "vitest";
import { answerQuestion, type KbDoc } from "../match";

// Mirrors the 5 seeded chatbot_kb_documents rows (supabase/seed.sql), after
// migration 009's withdrawal-keyword fix — see that migration's comment for
// why 'money' had to be added there.
const docs: KbDoc[] = [
  {
    id: "rewards", title: "How to earn rewards?",
    body: "You can earn rewards by recommending vendors or sharing affiliate links.",
    keywords: ["earn", "reward", "money", "how"], category: "rewards",
  },
  {
    id: "affiliate", title: "How do affiliate links work?",
    body: "After KYC verification, generate your unique link from any vendor page.",
    keywords: ["affiliate", "link", "commission", "share"], category: "affiliate",
  },
  {
    id: "withdrawal", title: "Withdrawal timeline?",
    body: "Withdrawals are reviewed by an Approver within 24-48 hours.",
    keywords: ["withdraw", "payout", "how long", "approval", "money"], category: "wallet",
  },
  {
    id: "booking", title: "How to book an activity?",
    body: "Browse activities, select a time slot, add to cart, and checkout.",
    keywords: ["book", "activity", "slot", "how"], category: "booking",
  },
  {
    id: "kyc", title: "KYC verification?",
    body: "Go to Profile > Verification. Upload a government-issued ID.",
    keywords: ["kyc", "verify", "identity", "document"], category: "account",
  },
];

describe("answerQuestion", () => {
  it("matches the withdrawal doc for the demo script's exact query, not the rewards doc", () => {
    const result = answerQuestion("how do I withdraw money", docs);
    expect(result?.id).toBe("withdrawal");
  });

  it("matches the KYC doc for a verification question", () => {
    const result = answerQuestion("how do I verify my identity", docs);
    expect(result?.id).toBe("kyc");
  });

  it("returns null for a plausible but under-specified question (single-keyword match, below threshold)", () => {
    // Only 'verify' matches the KYC doc's 4 keywords (1/4 = 0.25 < 0.3) — this
    // is the matcher correctly declining to guess rather than a bug.
    const result = answerQuestion("how do I verify my account", docs);
    expect(result).toBeNull();
  });

  it("matches the affiliate doc for a commission question", () => {
    const result = answerQuestion("how does the affiliate commission work", docs);
    expect(result?.id).toBe("affiliate");
  });

  it("never invents an answer for an unrelated question (demo script: wheelchair accessibility)", () => {
    const result = answerQuestion("is the tour wheelchair accessible", docs);
    expect(result).toBeNull();
  });

  it("returns null for an empty doc list", () => {
    expect(answerQuestion("how do I withdraw money", [])).toBeNull();
  });

  it("ignores a doc with no keywords rather than crashing", () => {
    const withEmpty: KbDoc[] = [...docs, { id: "empty", title: "x", body: "x", keywords: [], category: null }];
    const result = answerQuestion("how do I withdraw money", withEmpty);
    expect(result?.id).toBe("withdrawal");
  });
});
