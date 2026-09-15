// P4 — Member 4: Affiliate Copilot (CLAUDE-AFFILIATE-COPILOT.md).
// GET /api/affiliate/copilot?lang=en|bm|zh — the current user's real
// performance signals, phrased into 2-4 grounded next-best-action
// suggestions. Never a 500 for "the LLM is down" — same as
// /api/affiliate/insight, that's a normal degrade to the rule-based path,
// not an API failure. Gated by the same capability as the insight card
// (affiliate.earn_commission — a KYC-verified affiliate).

import { createClient } from '@/lib/supabase/server';
import { apiOk, apiFail } from '@/lib/validation/schemas';
import { getCopilotSignals, generateCopilotActions } from '@/lib/affiliate/copilot';
import type { ChatLanguage } from '@/lib/chatbot/language';
import {
  customerCapabilityFailure,
  resolveServerCustomerCapability,
} from '@/lib/auth/customer-capabilities.server';

const VALID_LANGS: ChatLanguage[] = ['en', 'bm', 'zh'];

function parseLang(value: string | null): ChatLanguage {
  return VALID_LANGS.includes(value as ChatLanguage) ? (value as ChatLanguage) : 'en';
}

export async function GET(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return apiFail('UNAUTHORIZED', 'Sign in required', 401);

  const decision = await resolveServerCustomerCapability(user.id, 'affiliate.earn_commission');
  const failure = customerCapabilityFailure(
    'affiliate.earn_commission',
    decision,
    'Complete KYC verification to generate Copilot suggestions',
  );
  if (failure) return failure;

  const lang = parseLang(new URL(request.url).searchParams.get('lang'));

  const signals = await getCopilotSignals(supabase, user.id);
  const result = await generateCopilotActions(signals, lang);

  return apiOk(result);
}
