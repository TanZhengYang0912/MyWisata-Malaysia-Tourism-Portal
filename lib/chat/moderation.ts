// Shopee-style local masking for chat messages — synchronous regex/wordlist,
// not an LLM call, so it can run on both the client (customer send path) and
// server (vendor/attachment routes) with no latency cost.

export type ModerationFlag = 'email' | 'link' | 'phone' | 'profanity';

export interface MaskResult {
  clean: string;
  flags: ModerationFlag[];
}

const PHONE_MASK = '••••••';
const CONTACT_MASK = '••••••';
const PROFANITY_MASK = '****';

const EMAIL_PATTERN = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;

const LINK_PATTERNS = [
  /https?:\/\/\S+/gi,
  /www\.\S+/gi,
  /\b(?:wa\.me|t\.me|whatsapp|wechat|telegram|instagram)(?:\.\S+)?\b/gi,
  /@[a-z0-9_.]{2,}/gi,
];

// Digit run of 7+ actual digits, allowing spaces/dashes/dots/parens/leading + —
// covers 012-3456789, 03-1234 5678, +60 12 345 6789 — without catching "RM 42".
const PHONE_CANDIDATE_PATTERN = /\+?\d[\d\s().-]{5,}\d/g;

const PROFANITY_WORDS = [
  // English
  'fuck', 'shit', 'bitch', 'asshole', 'bastard', 'dick', 'cunt', 'slut', 'whore',
  // Malay
  'bodoh', 'sial', 'bangsat', 'pukimak', 'babi', 'anjing', 'celaka', 'bodo',
];
const PROFANITY_PATTERN = new RegExp(`\\b(${PROFANITY_WORDS.join('|')})\\b`, 'gi');

function digitCount(text: string): number {
  return (text.match(/\d/g) ?? []).length;
}

export function maskChatBody(text: string): MaskResult {
  const flags = new Set<ModerationFlag>();
  let clean = text;

  // .match() (unlike .test()) always resets a global regex's lastIndex to 0
  // before running, so these module-level /g patterns stay safe to reuse
  // across calls instead of leaking scan position between messages.
  if (clean.match(EMAIL_PATTERN)) flags.add('email');
  clean = clean.replace(EMAIL_PATTERN, CONTACT_MASK);

  for (const pattern of LINK_PATTERNS) {
    if (clean.match(pattern)) flags.add('link');
    clean = clean.replace(pattern, CONTACT_MASK);
  }

  clean = clean.replace(PHONE_CANDIDATE_PATTERN, (match) => {
    if (digitCount(match) < 7) return match;
    flags.add('phone');
    return PHONE_MASK;
  });

  if (clean.match(PROFANITY_PATTERN)) flags.add('profanity');
  clean = clean.replace(PROFANITY_PATTERN, PROFANITY_MASK);

  return { clean, flags: Array.from(flags) };
}
