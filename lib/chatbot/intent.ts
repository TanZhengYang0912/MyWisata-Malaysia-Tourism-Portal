// P4 — Member 4: chatbot intent gate. CLAUDE-FIXES.md Fix 1 Step 1.
//
// Pure, no framework/DB/LLM imports — cheap phrase matching only, applied
// BEFORE retrieval or any LLM call. This is what stops "hi" (and "thanks",
// "ok", "bye"...) from escalating to a support ticket: those were never
// questions in the first place, so treating a KB miss as failure was wrong
// for them specifically — no amount of retrieval tuning fixes a category
// error like that.

import { normalize } from './match';

export type Intent = 'greeting' | 'chitchat' | 'question' | 'unclear';

const GREETING_PHRASES = [
  'hi', 'hello', 'hey', 'yo', 'sup', 'hai',
  'good morning', 'good afternoon', 'good evening', 'good day',
  'selamat pagi', 'selamat tengah hari', 'selamat petang', 'selamat malam',
];

const CHITCHAT_PHRASES = [
  'thanks', 'thank you', 'thx', 'ty',
  'ok', 'okay', 'kk', 'alright',
  'cool', 'nice', 'great', 'awesome',
  'lol', 'haha',
  'bye', 'goodbye', 'see ya', 'see you', 'cya',
];

/** True if `normalized` IS one of `phrases`, or starts with one followed by more filler (e.g. "hi there"). */
function matchesAnyPhrase(normalized: string, phrases: string[]): boolean {
  return phrases.some((p) => normalized === p || normalized.startsWith(`${p} `));
}

/**
 * Cheap, deterministic — no LLM call. Order matters: greeting/chitchat are
 * checked before the word-count 'unclear' fallback, since "hi" and "thanks"
 * are themselves short.
 *
 * The <=4-word gate before the phrase check keeps a message that merely
 * STARTS with a greeting from being misclassified once it keeps going into
 * a real question — "hi how do I book a tour" (6 words) skips the phrase
 * check entirely and falls through to the word-count rule below, landing on
 * 'question' as it should. Only short, greeting/chitchat-only messages
 * ("hi", "hi there") get caught here.
 */
export function classifyIntent(message: string): Intent {
  const normalized = normalize(message);
  if (!normalized) return 'unclear';

  const words = normalized.split(' ').filter(Boolean);

  // A short message (<=4 words) consisting only of greeting/chitchat
  // filler is classified as such; a longer one, or one that continues into
  // more content, is treated as a real question instead (e.g. "hi, how do
  // I book a tour" should retrieve/generate, not get the canned greeting).
  if (words.length <= 4) {
    if (matchesAnyPhrase(normalized, GREETING_PHRASES)) return 'greeting';
    if (matchesAnyPhrase(normalized, CHITCHAT_PHRASES)) return 'chitchat';
  }

  if (words.length < 3) return 'unclear';

  return 'question';
}
