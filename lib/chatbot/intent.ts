// P4 — Member 4: chatbot intent gate. CLAUDE-FIXES.md Fix 1 Step 1.
//
// Pure, no framework/DB/LLM imports — cheap phrase matching only, applied
// BEFORE retrieval or any LLM call. This is what stops "hi" (and "thanks",
// "ok", "bye"...) from escalating to a support ticket: those were never
// questions in the first place, so treating a KB miss as failure was wrong
// for them specifically — no amount of retrieval tuning fixes a category
// error like that.
//
// CLAUDE-P4-EXTRAS.md Extra 1 (trilingual): Chinese needed a real fix here,
// not just more phrases. The word-count heuristics below (`words.length <=
// 4` / `< 3`) assume whitespace-delimited words. Chinese has no spaces
// between words at all, so ANY Chinese message — including a real, specific
// question — normalizes to a single "word" with this splitter, and would
// have fallen into the `words.length < 3` 'unclear' branch every time,
// never reaching retrieval or the LLM. Han-script messages now take a
// separate character-count-based path instead of the word-count one.

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

// Chinese greetings/chitchat are matched by exact standalone token only
// (no "starts with, followed by more content" rule like the Latin-script
// list below) — CJK has no space to mark where the filler word ends and a
// real question begins, so only a short, single-token message can be
// classified this way with any confidence.
const GREETING_PHRASES_ZH = new Set(['你好', '嗨', '哈喽', '早安', '午安', '晚安', '早上好', '下午好', '晚上好']);
const CHITCHAT_PHRASES_ZH = new Set(['谢谢', '谢了', '多谢', '感谢', '好的', '好', '可以', '再见', '拜拜', '拜']);

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

  if (/\p{Script=Han}/u.test(normalized)) {
    if (GREETING_PHRASES_ZH.has(normalized)) return 'greeting';
    if (CHITCHAT_PHRASES_ZH.has(normalized)) return 'chitchat';
    // Character count, not word count — see the file header. Chinese is
    // information-dense per character, so a much lower bar than the 3-word
    // English/BM one is the right equivalent for "too short to be a real
    // question" (e.g. a bare "嗯" or "？" with punctuation stripped).
    const charCount = normalized.replace(/\s/g, '').length;
    return charCount < 3 ? 'unclear' : 'question';
  }

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
