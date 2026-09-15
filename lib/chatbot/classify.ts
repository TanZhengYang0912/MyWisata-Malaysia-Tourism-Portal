// P4 — Member 4: support ticket auto-classification. Pure, no framework/DB
// imports. See CLAUDE.md Step 8.

import { contentWords, normalize } from "./match";

export type TicketCategory = "booking" | "payment" | "vendor" | "withdrawal" | "kyc" | "technical" | "affiliate" | "general";

// CLAUDE-P4-EXTRAS-2.md Extra 5 follow-up: the single source of truth for
// this category set, reused by the admin chatbot KB form's category
// dropdown (app/admin/chatbot/page.tsx) so it can't drift from what this
// classifier actually produces. chatbot_kb_documents.category itself is an
// unconstrained VARCHAR(50) (001_initial_schema.sql — no CHECK constraint,
// confirmed against every migration that touches the table) — this array,
// not the schema, is what enforces the fixed set for KB docs going forward.
//
// "withdrawal" is the stored/matched value for what admins see labelled the
// Wallet team (lib/support/team-routing.ts) — kept as-is rather than renamed
// to "wallet" so existing tickets' category values don't need a migration;
// its own keywords already cover general wallet/balance issues, not just
// withdrawals specifically.
export const TICKET_CATEGORIES: TicketCategory[] = ["booking", "payment", "vendor", "withdrawal", "kyc", "technical", "affiliate", "general"];

const CATEGORY_KEYWORDS: Record<Exclude<TicketCategory, "general">, string[]> = {
  booking: ["book", "booking", "slot", "activity", "reservation", "cancel", "itinerary", "qr"],
  payment: ["pay", "payment", "card", "charge", "checkout", "refund", "receipt", "voucher"],
  vendor: ["vendor", "outlet", "shop", "business", "merchant", "seller", "listing"],
  withdrawal: ["withdraw", "withdrawal", "payout", "bank", "wallet", "balance", "topup", "deposit"],
  kyc: ["kyc", "verification", "verify", "identity", "mykad", "passport"],
  technical: ["error", "bug", "crash", "glitch", "freeze", "frozen", "unresponsive", "blank"],
  affiliate: ["affiliate", "link", "commission", "referral", "share"],
};

/**
 * Keyword-rule classifier: counts matches per category, picks the highest,
 * falls back to 'general' if nothing matches (never leaves a ticket
 * uncategorized — 'general' is always a safe default, unlike answerQuestion()
 * which returns null rather than guess).
 */
export function classifyTicket(text: string): TicketCategory {
  const words = contentWords(normalize(text));

  let best: TicketCategory = "general";
  let bestMatches = 0;

  for (const [category, keywords] of Object.entries(CATEGORY_KEYWORDS) as [
    Exclude<TicketCategory, "general">,
    string[],
  ][]) {
    const matches = keywords.filter((k) => words.has(k)).length;
    if (matches > bestMatches) {
      bestMatches = matches;
      best = category;
    }
  }

  return best;
}
