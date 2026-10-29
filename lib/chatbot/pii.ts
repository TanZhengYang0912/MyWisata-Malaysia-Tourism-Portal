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

export type ExternalTextResult =
  | { allowed: true; clean: string; found: boolean }
  | { allowed: false };

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
  // Other international phone formats, including separators and country codes.
  { token: '[PHONE]', regex: /(?<!\d)(?:\+\d{1,3}[\s().-]?)?(?:\d[\s().-]?){8,13}\d(?!\d)/g },
  // Account numbers are only redacted when explicitly labelled as banking data.
  { token: '[BANK_ACCOUNT]', regex: /\b(?:account|acct|bank\s*(?:account|no\.?|number))\s*[:#-]?\s*[A-Z0-9-]{7,24}\b/gi },
  { token: '[BANK_ACCOUNT]', regex: /\b(?:bank\s*(?:account|no\.?|number)|account\s*(?:no\.?|number))\s*[:#-]?\s*\d{4,6}\b/gi },
  // International bank transfer identifiers.
  { token: '[IBAN]', regex: /\b[A-Z]{2}\d{2}[A-Z0-9]{11,30}\b/gi },
  { token: '[SWIFT]', regex: /\b(?:swift|bic)(?:\s+code)?\s*[:#-]?\s*[A-Z]{4}[A-Z]{2}[A-Z0-9]{2}(?:[A-Z0-9]{3})?\b/gi },
];

const PRIVATE_CONTEXT = /\b(?:kyc|know your customer|identity document|passport number|(?:my\s+)?name is|full name|my (?:personal )?(?:bank(?: account)?|account number|(?:home )?address)(?: is| number| details| information)?|i live at|i stay at|my address is|alamat saya|saya tinggal di)\b/i;
const PRIVATE_CONTEXT_CJK = /(?:身份证(?:号码)?|护照(?:号码)?|(?:我的|本人)?(?:银行账户|账号|住址|地址|电话号码)|(?:我叫|我的名字是|本人姓名是)\s*[\p{Script=Han}]{2,4}(?=$|[，。,.！!？?\s])|(?:我叫|我的名字是|本人姓名是)\s*[\p{Script=Latin}][\p{Script=Latin}'’.-]{1,39}(?=$|[，。,.！!？?\s])|(?:我住在|本人住在|我家在)\s*[\p{Script=Han}0-9#\-]{0,30})/u;
const UNIT_ADDRESS = /\b(?:block|unit|apartment|flat|suite)\s*#?\s*\d{1,4}[A-Za-z-]?\s*,\s*[\p{L}][\p{L} .'-]*\s*,\s*[\p{L}][\p{L} .'-]*/iu;
const NUMBERED_STREET_ADDRESS = /\b(?:no\.?\s*)?\d{1,5}\s+(?:jalan|jln\.?|lorong|street|st\.?|road|rd\.?|avenue|ave\.?|lane|drive|boulevard)\b/i;
const CITY_POSTCODE_ADDRESS = /\b[A-Z][\p{L}.'-]*(?:\s+[A-Z][\p{L}.'-]*){0,3},\s+[A-Z][\p{L}.'-]*(?:\s+[A-Z][\p{L}.'-]*){0,2}\s+\d{5}\b/iu;
const CHINESE_NUMBERED_ADDRESS = /[\p{Script=Han}]{2,}(?:市|区|县|镇|路|街|巷)[\p{Script=Han}0-9号弄室-]{0,16}\d{1,5}(?:号|弄|室)/u;
const PHONE_LIKE_NUMBER = /(?<!\d)\d(?:[\s().-]?\d){6,15}(?!\d)/g;

function hasUnlabelledPhoneLikeNumber(text: string): boolean {
  for (const match of text.matchAll(PHONE_LIKE_NUMBER)) {
    const value = match[0];
    if (/^\d{4}-\d{2}-\d{2}$/.test(value)) continue;
    const before = text.slice(Math.max(0, (match.index ?? 0) - 8), match.index);
    if (/\b(?:RM|MYR|USD|EUR|GBP|SGD)\s*$/i.test(before)) continue;
    return true;
  }
  return false;
}

/** Prepare arbitrary user text for an external model. Unstructured address/KYC/bank text is denied entirely. */
export function prepareExternalText(text: string): ExternalTextResult {
  if (
    PRIVATE_CONTEXT.test(text)
    || PRIVATE_CONTEXT_CJK.test(text)
    || UNIT_ADDRESS.test(text)
    || NUMBERED_STREET_ADDRESS.test(text)
    || CITY_POSTCODE_ADDRESS.test(text)
    || CHINESE_NUMBERED_ADDRESS.test(text)
    || hasUnlabelledPhoneLikeNumber(text)
  ) return { allowed: false };
  const redacted = redactPII(text);
  // A partially redacted prompt can still reveal sensitive context. Reject
  // the whole prompt so the model never receives placeholders beside it.
  if (redacted.found) return { allowed: false };
  return { allowed: true, clean: redacted.clean, found: redacted.found };
}

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
