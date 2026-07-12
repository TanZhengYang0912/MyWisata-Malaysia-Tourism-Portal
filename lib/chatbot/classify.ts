// P4 — Member 4: support ticket auto-classification. Pure, no framework/DB
// imports. See CLAUDE.md Step 8.

import { contentWords, normalize } from "./match";

export type TicketCategory = "booking" | "payment" | "vendor" | "withdrawal" | "affiliate" | "general";

const CATEGORY_KEYWORDS: Record<Exclude<TicketCategory, "general">, string[]> = {
  booking: ["book", "booking", "slot", "activity", "reservation", "cancel", "itinerary", "qr"],
  payment: ["pay", "payment", "card", "charge", "checkout", "refund", "receipt", "voucher"],
  vendor: ["vendor", "outlet", "shop", "business", "merchant", "seller", "listing"],
  withdrawal: ["withdraw", "withdrawal", "payout", "bank", "wallet", "balance"],
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
