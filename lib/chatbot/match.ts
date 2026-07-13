// P4 — Member 4: FAQ keyword matcher. Pure, no framework/DB imports — KB docs
// are passed in rather than fetched here, so this stays swappable for an
// LLM-backed version later without touching any caller (CLAUDE.md Section 8).
// See CLAUDE.md Step 7.

export interface KbDoc {
  id: string;
  title: string;
  body: string;
  keywords: string[];
  category: string | null;
}

const MATCH_THRESHOLD = 0.3;

// Deliberately modest — this is a keyword matcher, not a full NLP stopword
// list. Some of these (e.g. 'how') are themselves seeded as real keywords on
// some KB docs (see migration 011's note); stripping them from the QUESTION
// only, never from a doc's own keyword list, is what keeps that working.
const STOPWORDS = new Set([
  "a", "an", "the", "is", "are", "am", "was", "were", "be", "been", "being",
  "do", "does", "did", "doing", "done",
  "i", "you", "he", "she", "it", "we", "they", "my", "your", "his", "her", "its", "our", "their",
  "to", "of", "in", "on", "at", "for", "with", "about", "from", "into", "by", "as",
  "and", "or", "but", "if", "so", "than", "that", "this", "these", "those",
  "can", "could", "would", "should", "will", "shall", "may", "might", "must",
  "how", "what", "when", "where", "who", "whom", "which", "why",
]);

// Exported for reuse by lib/chatbot/classify.ts — same normalize/stopword
// rules should apply to both keyword matchers in this domain.
export function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function contentWords(normalizedText: string): Set<string> {
  return new Set(normalizedText.split(" ").filter((w) => w.length > 0 && !STOPWORDS.has(w)));
}

/** Multi-word keywords (e.g. "how long") can never appear as a single token,
 * so they're matched as a substring of the full question instead. */
function keywordMatches(keyword: string, words: Set<string>, normalizedQuestion: string): boolean {
  const k = keyword.toLowerCase().trim();
  if (!k) return false;
  return k.includes(" ") ? normalizedQuestion.includes(k) : words.has(k);
}

/**
 * Scores each doc by (matched keywords / total keywords for that doc) and
 * returns the highest scorer at or above 0.3 — or null. Never invents an
 * answer: a doc with no keywords, or a question that clears no threshold,
 * yields null, and the caller must fall back to "I don't know."
 */
export function answerQuestion(question: string, docs: KbDoc[]): KbDoc | null {
  const normalizedQuestion = normalize(question);
  const words = contentWords(normalizedQuestion);

  let best: KbDoc | null = null;
  let bestScore = 0;

  for (const doc of docs) {
    if (doc.keywords.length === 0) continue;
    const matched = doc.keywords.filter((k) => keywordMatches(k, words, normalizedQuestion)).length;
    const score = matched / doc.keywords.length;
    if (score > bestScore) {
      bestScore = score;
      best = doc;
    }
  }

  return bestScore >= MATCH_THRESHOLD ? best : null;
}
