// P4 — Member 4: AI Budget Guard. lib/customer/budget-guard.ts.
// POST /api/customer/budget-guard — real over-budget detection + real,
// cheaper catalogue alternatives for a set of picked items. Prices/category/
// state are always re-resolved server-side from the real product record
// (resolveBudgetItems) — a client-supplied price is never trusted, same
// discipline as the rest of the checkout path (see lib/validation/schemas.ts
// header note on CLAUDE.md Section 2).
//
// No capability gate: this is a stateless computation over caller-supplied
// {productId, qty} lines, not a read of the caller's own account data —
// same reasoning as /api/vouchers/validate. Works for a signed-in customer's
// cart today; equally usable for a trip's picked items once that backend is real.

import { parseBody, apiOk, budgetGuardCheckSchema } from '@/lib/validation/schemas';
import { createServiceClient } from '@/lib/supabase/service';
import { resolveBudgetItems, evaluateBudget, generateBudgetGuardMessages } from '@/lib/customer/budget-guard';

export async function POST(request: Request) {
  const parsed = await parseBody(request, budgetGuardCheckSchema);
  if (!parsed.ok) return parsed.response;
  const { lines, budgetRM, lang } = parsed.data;

  const db = createServiceClient();
  const items = await resolveBudgetItems(lines, db);
  const result = await evaluateBudget(items, budgetRM, db);
  const { messages, mode } = await generateBudgetGuardMessages(result, lang ?? 'en');

  return apiOk({ result, messages, mode });
}
