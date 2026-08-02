// P4 — Member 4: lightweight language pre-detection for the chatbot.
// CLAUDE-P4-EXTRAS.md Extra 1 — pure heuristic, NOT a translation layer.
// Used only to pick which language's FIXED strings (fallback/greeting/
// chitchat/unclear in answer.ts, and the feedback-flow chrome in
// chatbot-widget.tsx) to show. The actual generated answer's language is
// the LLM's own job (see generate.ts's system prompt, which tells Gemini to
// detect and match the question's language itself) — this only needs to be
// right often enough to pick a reasonable fixed string, never a translation
// of a fact. A wrong guess here shows an English string; it can't change
// what facts get returned.
//
// No framework/DB imports — safe to import from a Client Component too
// (chatbot-widget.tsx uses it directly on the user's own input, so the
// network-failure error message can still be localized without a round
// trip).

import { normalize } from './match';

export type ChatLanguage = 'en' | 'bm' | 'zh';

// High-frequency Bahasa Melayu function/content words that essentially
// never appear in ordinary English or Chinese text. A short, low-ambiguity
// marker list rather than a full BM dictionary — this only has to beat
// "obviously not BM", not parse the sentence.
const BM_MARKERS = new Set([
  'saya', 'awak', 'kau', 'kamu', 'nak', 'hendak', 'tak', 'tidak', 'boleh',
  'macam', 'mana', 'bagaimana', 'kenapa', 'mengapa', 'apa', 'siapa', 'bila',
  'duit', 'wang', 'tolong', 'sila', 'minta', 'terima', 'kasih', 'yang',
  'dengan', 'untuk', 'adalah', 'ialah', 'ini', 'itu', 'berapa',
  'pengeluaran', 'keluarkan', 'pesanan', 'tempahan', 'akaun', 'ada', 'tiada',
  'sudah', 'belum', 'lagi', 'juga', 'sahaja', 'je', 'lah', 'kan', 'dapat',
  'guna', 'buat', 'nanti', 'sekarang', 'esok', 'semalam',
  // Greeting/farewell vocabulary — kept in sync with intent.ts's
  // GREETING_PHRASES so a bare "selamat pagi" (recognized there as a
  // greeting) also resolves to the BM strings here, not the English
  // default. Found live: "selamat pagi" alone has no hit against the list
  // above (neither word overlaps it) and was silently defaulting to 'en'.
  'selamat', 'pagi', 'tengah', 'petang', 'malam', 'hai',
]);

/** True if `text` contains any Han-script (Chinese) character. */
function hasHanScript(text: string): boolean {
  return /\p{Script=Han}/u.test(text);
}

/**
 * Detects English / Bahasa Melayu / Chinese from raw user text. Chinese is
 * a hard script-level signal (checked first, always wins). BM is detected
 * by counting marker-word hits; everything else defaults to English.
 */
export function detectLanguage(text: string): ChatLanguage {
  if (hasHanScript(text)) return 'zh';

  const normalized = normalize(text);
  const words = normalized.split(' ').filter(Boolean);
  const bmHits = words.filter((w) => BM_MARKERS.has(w)).length;

  // One marker is enough for a short message; a longer message needs two,
  // so a single stray token (e.g. a name that happens to collide, "ada")
  // doesn't misclassify an otherwise-English sentence.
  const threshold = words.length <= 6 ? 1 : 2;
  return bmHits >= threshold ? 'bm' : 'en';
}
