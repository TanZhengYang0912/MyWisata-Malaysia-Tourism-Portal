// P4 — Member 4: AI Vendor Revenue Assistant. lib/vendor/revenue-assistant.ts.
// GET /api/vendor/revenue-assistant?lang=en|bm|zh — the current vendor's real
// listing-quality, occupancy, and ratings/refund signals, phrased into 2-4
// grounded, prioritized actions. Never a 500 for "the LLM is down" — same as
// the affiliate/trip copilots, that's a normal degrade to the rule-based path.
//
// Read-only on vendor/booking data, as the spec requires — this route only
// ever selects from products/booking_slots/reviews/order_items/orders, never
// writes to any of them.

import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';
import { apiOk, apiFail } from '@/lib/validation/schemas';
import { resolveVendorScope, getVendorRevenueSignals, generateVendorRevenueActions } from '@/lib/vendor/revenue-assistant';
import type { ChatLanguage } from '@/lib/chatbot/language';

const VALID_LANGS: ChatLanguage[] = ['en', 'bm', 'zh'];

function parseLang(value: string | null): ChatLanguage {
  return VALID_LANGS.includes(value as ChatLanguage) ? (value as ChatLanguage) : 'en';
}

export async function GET(request: Request) {
  const authDb = await createClient();
  const { data: { user } } = await authDb.auth.getUser();
  if (!user) return apiFail('UNAUTHORIZED', 'Sign in required', 401);

  const scope = await resolveVendorScope(authDb, user.id);
  if (!scope) return apiFail('FORBIDDEN', 'Not a vendor or outlet manager', 403);

  const lang = parseLang(new URL(request.url).searchParams.get('lang'));

  const service = createServiceClient();
  const signals = await getVendorRevenueSignals(scope, service);
  const result = await generateVendorRevenueActions(signals, lang);

  return apiOk(result);
}
