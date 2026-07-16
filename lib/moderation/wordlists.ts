// P4 — Member 4: moderation word lists. CLAUDE-MODERATION.md Part 1.
//
// One editable place, not scattered inline. Two separate lists because they
// carry different severity (lib/moderation/profanity.ts tags each hit by
// which list it came from): SLUR_WORDS are a safety issue (high severity,
// auto-flagged to admin — see lib/moderation/clean.ts), PROFANITY_WORDS are
// a civility issue (masked, but otherwise routine).
//
// Deliberately not exhaustive ("reasonable coverage, not an arms race" —
// CLAUDE-MODERATION.md). Each entry is a base word; lib/moderation/profanity.ts
// builds spacing/leetspeak/repeated-character tolerance around it at match
// time, so the list itself only needs the canonical spelling.

export const PROFANITY_WORDS = [
  'fuck',
  'shit',
  'bitch',
  'bastard',
  'asshole',
  'ass',
  'dick',
  'piss',
  'crap',
  'damn',
  'douche',
  'cock',
  'pussy',
  'twat',
  'wanker',
  'bollocks',
  'bugger',
  'slut',
  'whore',
  'motherfucker',
];

// Racial, ethnic, homophobic, and other hate-speech slur roots. High
// severity — see lib/moderation/clean.ts's severity resolution and the
// auto-flag path wired into every insertion point.
export const SLUR_WORDS = [
  'nigger',
  'nigga',
  'chink',
  'gook',
  'spic',
  'kike',
  'wetback',
  'coon',
  'paki',
  'raghead',
  'towelhead',
  'faggot',
  'fag',
  'dyke',
  'tranny',
  'retard',
  'cripple',
];
