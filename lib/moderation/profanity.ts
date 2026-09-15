// P4 — Member 4: shared profanity/slur filter. CLAUDE-MODERATION.md Part 1.
// Framework-agnostic — no Next.js imports — so any module on the team can
// use it (chatbot, tickets, or later: reviews, vendor descriptions, vendor
// chat, per this doc's "tell the team" section).
//
// Scunthorpe-safe: each word is matched only when NOT immediately adjacent
// to another letter on either side (negative lookaround), so "assess",
// "class", "cockpit", and "Scunthorpe" itself are never touched — a banned
// root only fires as a whole word, never as a substring of a clean one.
//
// Evasion tolerance, built per word at match time from its canonical
// spelling in lib/moderation/wordlists.ts:
//   - repeated characters ("shiiiit") — each letter's class is `+` (one or more)
//   - spacing/punctuation between letters ("f u c k", "f-u-c-k")
//   - common leetspeak substitutions ("sh1t", "@ss")
// This is deliberately "reasonable coverage, not an arms race" — it deters
// casual masking-evasion, not a determined attacker rewriting every letter.

import { PROFANITY_WORDS, SLUR_WORDS } from './wordlists';

export type HitCategory = 'profanity' | 'slur';

export interface MaskProfanityResult {
  masked: string;
  hits: HitCategory[];
  hadHits: boolean;
}

const LEET_VARIANTS: Record<string, string> = {
  a: 'a4@',
  b: 'b8',
  c: 'c(',
  e: 'e3',
  g: 'g9',
  i: 'i1!',
  l: 'l1',
  o: 'o0',
  s: 's5$',
  t: 't7',
  u: 'uv',
};

function escapeForCharClass(chars: string): string {
  return chars.replace(/[\\\]^-]/g, '\\$&');
}

function letterClass(letter: string): string {
  const variants = LEET_VARIANTS[letter.toLowerCase()] ?? letter;
  return `[${escapeForCharClass(variants)}]+`;
}

// A small, fixed set of common English suffixes ("fuck" -> "fucking",
// "bastard" -> "bastards"), tried longest-first so "ers" doesn't get
// preempted by "er" and leave a trailing "s" unconsumed. Still fully
// Scunthorpe-safe: this is a closed list of exact strings, not "any
// letters" — "assess"/"assessment"'s trailing "ess"/"essment" doesn't match
// any of them, so the lookahead below still blocks those correctly (see
// lib/moderation/__tests__/profanity.test.ts).
const COMMON_SUFFIXES = ['ers', 'ing', 'ed', 'er', 'y', 's'];

/** Builds a Scunthorpe-safe, evasion-tolerant regex source for one canonical word. */
function buildWordPattern(word: string): string {
  const body = word
    .toLowerCase()
    .split('')
    .map(letterClass)
    .join('[\\s\\-_.]*');
  const suffix = `(?:${COMMON_SUFFIXES.join('|')})?`;
  // Lookaround on plain letters only — the match body's own leet/spacing
  // tolerance (plus the optional suffix) already covers the word and its
  // common inflections; the boundary just needs to rule out being glued to
  // a longer clean word (the actual Scunthorpe case).
  return `(?<![a-zA-Z])${body}${suffix}(?![a-zA-Z])`;
}

interface CompiledList {
  category: HitCategory;
  regex: RegExp;
}

function compileList(words: string[], category: HitCategory): CompiledList {
  const pattern = words.map(buildWordPattern).join('|');
  return { category, regex: new RegExp(pattern, 'gi') };
}

// Compiled once at module load, not per call.
const COMPILED_LISTS: CompiledList[] = [
  compileList(SLUR_WORDS, 'slur'),
  compileList(PROFANITY_WORDS, 'profanity'),
];

function maskMatch(match: string): string {
  if (match.length <= 1) return match;
  return match[0] + '*'.repeat(match.length - 1);
}

/** Admin-added words (lib/moderation/custom-words.ts) — merged in per call, since they can change at any time. */
export interface ExtraWords {
  profanity: string[];
  slur: string[];
}

export function maskProfanity(text: string, extra?: ExtraWords): MaskProfanityResult {
  let masked = text;
  const hits = new Set<HitCategory>();

  const lists = [...COMPILED_LISTS];
  if (extra?.slur.length) lists.push(compileList(extra.slur, 'slur'));
  if (extra?.profanity.length) lists.push(compileList(extra.profanity, 'profanity'));

  for (const { category, regex } of lists) {
    regex.lastIndex = 0; // reset shared regex state between calls
    if (regex.test(masked)) hits.add(category);
    regex.lastIndex = 0;
    masked = masked.replace(regex, maskMatch);
  }

  return {
    masked,
    hits: [...hits],
    hadHits: hits.size > 0,
  };
}
