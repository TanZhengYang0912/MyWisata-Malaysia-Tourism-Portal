// P4 — Member 4: PII redaction boundary for the chatbot's LLM calls.
// CLAUDE-ADMIN-AI.md Part 1 — closes a live §7.3 compliance gap: raw user
// messages were going straight to Gemini for both generation (generate.ts)
// and embedding (embed.ts). This is the single redaction boundary for both.
//
// Design: the ORIGINAL message is what gets stored in chatbot_messages (the
// user needs to see what they actually typed) and what gets logged for
// admin transcripts. Only the text handed to redactPII()'s caller — right
// before the Gemini fetch — is the redacted version. Nothing else in the
// pipeline (retrieval scoring, KB matching, keyword fallback) needs this;
// none of those send text externally.
//
// Patterns are intentionally conservative (a few false positives on ordinary
// numbers is an acceptable cost; a missed IC number reaching Google is not).
// Order matters only where a broader pattern could otherwise eat a token a
// narrower one should claim first — each pattern below is word-boundary
// anchored to an exact or bounded length, so in practice they don't overlap.

export interface RedactResult {
  clean: string;
  found: boolean;
}

const PATTERNS: { token: string; regex: RegExp }[] = [
  // Malaysian IC — dashed form: 990101-14-5678
  { token: '[IC]', regex: /\b\d{6}-\d{2}-\d{4}\b/g },
  // Malaysian IC — 12-digit no-dash form. Word-boundary + exact length keeps
  // this from colliding with the 13-16 digit card pattern below.
  { token: '[IC]', regex: /\b\d{12}\b/g },
  // Passport — one letter followed by 8 digits (e.g. A12345678).
  { token: '[PASSPORT]', regex: /\b[A-Za-z]\d{8}\b/g },
  // Malaysian mobile — +60/60/0 prefix, 1x line, optional dash/space groups.
  { token: '[PHONE]', regex: /(?:\+?60|0)1[0-9][-\s]?\d{3,4}[-\s]?\d{3,4}\b/g },
  // Email.
  { token: '[EMAIL]', regex: /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g },
  // Credit-card-like — 13-16 consecutive digits.
  { token: '[CARD]', regex: /\b\d{13,16}\b/g },
];

/**
 * Redacts Malaysia-appropriate PII patterns from text before it's sent to
 * an external LLM API (generation or embedding). Returns the redacted text
 * plus whether anything was found — callers log the boolean on the message
 * row, never the PII itself.
 */
export function redactPII(text: string): RedactResult {
  let clean = text;
  let found = false;

  for (const { token, regex } of PATTERNS) {
    if (regex.test(clean)) {
      found = true;
      clean = clean.replace(regex, token);
    }
    regex.lastIndex = 0; // regex has the 'g' flag — .test() advances lastIndex, reset for reuse
  }

  return { clean, found };
}
