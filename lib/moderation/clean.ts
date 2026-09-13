// P4 — Member 4: single moderation entry point. CLAUDE-MODERATION.md Part 3.
// Everything downstream (chatbot, tickets) calls this one function so
// behaviour is identical across all four inputs it's wired into.
//
// ⚠️ Resolving an internal inconsistency in CLAUDE-MODERATION.md itself:
// its `cleanUserContent()` code-comment block labels BOTH `display` and
// `original` as "profanity-masked". That contradicts Part 1's own table
// ("Store the original? YES — admin must see abuse to act on it" / "original
// kept in a field admins can see") and the explanatory note right after the
// code block ("admins see the real swear word... but still never see
// someone's raw IC number"). The table + the note are internally consistent
// with each other and state the actual design intent; the inline comment on
// `original` is the outlier. Implemented per the table + note: `original`
// keeps the real profanity (that's the whole point — admins need to see
// what was actually said to act on it) but still never contains raw PII.
//
// Both fields always go through redactPII() first — PII is never retained
// anywhere, in either field, no exceptions. Only profanity masking differs
// between the two.

import type { SupabaseClient } from '@supabase/supabase-js';
import { redactPII } from '@/lib/chatbot/pii';
import { maskProfanity } from './profanity';
import { getActiveTermsByCategory } from './custom-words';

export type ModerationSeverity = 'none' | 'low' | 'high';

export interface CleanedContent {
  /** PII-redacted AND profanity-masked. Safe to show to anyone; the normal stored/displayed text. */
  display: string;
  /** PII-redacted but profanity NOT masked — the "admin can see abuse" view. Still never contains raw PII. */
  original: string;
  hadProfanity: boolean;
  hadSlur: boolean;
  hadPII: boolean;
  /** 'high' if a slur was found (safety issue, always surfaced to admin) — see the auto-flag call sites. */
  severity: ModerationSeverity;
}

export async function cleanUserContent(text: string, service: SupabaseClient): Promise<CleanedContent> {
  const { clean: piiRedacted, found: hadPII } = redactPII(text);
  const extra = await getActiveTermsByCategory(service);
  const { masked: display, hits } = maskProfanity(piiRedacted, extra);
  const hadProfanity = hits.includes('profanity');
  const hadSlur = hits.includes('slur');

  const severity: ModerationSeverity = hadSlur ? 'high' : hadProfanity || hadPII ? 'low' : 'none';

  return {
    display,
    original: piiRedacted,
    hadProfanity,
    hadSlur,
    hadPII,
    severity,
  };
}
