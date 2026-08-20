'use client';

// P4 — CLAUDE-VOICE-INPUT.md Part 1: the ONE shared speech-to-text hook,
// mounted by both the chatbot widget (Part 2) and chat-thread-panel.tsx
// (Part 3) — recognition logic lives here exactly once, never duplicated
// per mount point.
//
// Placed under hooks/ (this repo's existing top-level hooks/ dir —
// use-auth.ts, use-cart.ts, use-chat-presence.ts already live there) rather
// than the spec's tentative lib/voice/useSpeechInput.ts suggestion, which
// itself said "(or hooks/)" — matching the established convention over a
// guess made without having read the repo yet.
//
// The browser Web Speech API (SpeechRecognition / webkitSpeechRecognition)
// isn't in this project's TS DOM lib, so the shapes below are hand-declared
// — minimal, only what this hook actually uses, not the full spec.

import { useCallback, useEffect, useRef, useState } from 'react';

interface SpeechRecognitionResultLike {
  readonly length: number;
  [index: number]: { transcript: string };
}

interface SpeechRecognitionEventLike extends Event {
  readonly results: ArrayLike<SpeechRecognitionResultLike>;
}

interface SpeechRecognitionErrorEventLike extends Event {
  readonly error: string;
}

interface SpeechRecognitionLike extends EventTarget {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: SpeechRecognitionErrorEventLike) => void) | null;
  onend: (() => void) | null;
}

interface SpeechRecognitionConstructorLike {
  new (): SpeechRecognitionLike;
}

function getSpeechRecognitionConstructor(): SpeechRecognitionConstructorLike | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as {
    SpeechRecognition?: SpeechRecognitionConstructorLike;
    webkitSpeechRecognition?: SpeechRecognitionConstructorLike;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

/**
 * Feature-detection only, pure, no hook state — callers (and tests) can
 * check support without mounting the hook. Also what the hook itself uses
 * for its lazy isSupported initializer (see the coding-standards note on
 * localStorage-on-mount: a synchronous browser check belongs in a lazy
 * useState initializer, not a useEffect + setState).
 */
export function isSpeechInputSupported(): boolean {
  return getSpeechRecognitionConstructor() !== null;
}

export type SpeechInputErrorKind = 'permission-denied' | 'no-speech' | 'network' | 'unknown';

const ERROR_KIND_MAP: Record<string, SpeechInputErrorKind> = {
  'not-allowed': 'permission-denied',
  'service-not-allowed': 'permission-denied',
  'no-speech': 'no-speech',
  network: 'network',
};

/**
 * Maps a raw SpeechRecognition error event code to one of our friendly
 * kinds. Pure, exported for unit testing. Anything not explicitly mapped
 * (audio-capture, aborted, language-not-supported, ...) becomes 'unknown' —
 * still a friendly state, never a crash, just without a more specific hint.
 */
export function mapSpeechRecognitionError(code: string): SpeechInputErrorKind {
  return ERROR_KIND_MAP[code] ?? 'unknown';
}

// CLAUDE-VOICE-INPUT.md: "Tie it to the app/user language... trilingual
// context." Matches lib/chatbot/language.ts's ChatLanguage vocabulary
// ('en'|'bm'|'zh') deliberately — not imported (this hook has no framework
// dependency on the chatbot module), just the same three codes, so both
// Part 2 and Part 3 can pass whatever they already track as the interface
// language straight through without a translation step of their own.
const RECOGNITION_LANG_MAP: Record<string, string> = {
  en: 'en-US',
  bm: 'ms-MY',
  zh: 'zh-CN',
};

/**
 * Resolves one of this app's trilingual codes to a BCP-47 recognition
 * language tag. Unrecognized input defaults to en-US ("default to the
 * interface language" — en-US is this app's default interface language).
 * Pure, exported so both mount points share one mapping instead of each
 * guessing their own.
 */
export function resolveRecognitionLang(appLang: string | null | undefined): string {
  if (!appLang) return 'en-US';
  return RECOGNITION_LANG_MAP[appLang] ?? 'en-US';
}

// Live-found (2026-08-21): the app-wide i18n system (lib/i18n/locale.ts,
// pulled in after this hook was first built) uses a DIFFERENT vocabulary —
// AppLocale is 'en'|'zh-CN'|'ms', not lib/chatbot/language.ts's ChatLanguage
// ('en'|'bm'|'zh'). The two never got unified, and forcing one through the
// other's map would silently mismatch ('ms' isn't a key in
// RECOGNITION_LANG_MAP above, so it would wrongly fall back to en-US). Any
// caller reading `i18n.resolvedLanguage` (most of the app, post-merge —
// e.g. the admin/customer support ticket pages) should use THIS resolver
// instead of the one above, which stays as-is for the chatbot widget's own
// ChatLanguage tracking.
const RECOGNITION_LANG_MAP_FROM_LOCALE: Record<string, string> = {
  en: 'en-US',
  ms: 'ms-MY',
  'zh-CN': 'zh-CN',
};

/** Resolves this app's real i18n locale code (AppLocale: 'en'|'zh-CN'|'ms') to a BCP-47 recognition language tag. Unrecognized/missing input defaults to en-US. */
export function resolveRecognitionLangFromLocale(locale: string | null | undefined): string {
  if (!locale) return 'en-US';
  return RECOGNITION_LANG_MAP_FROM_LOCALE[locale] ?? 'en-US';
}

export interface UseSpeechInputOptions {
  /** BCP-47 recognition language, e.g. "en-US" — use resolveRecognitionLang() to derive this from an 'en'|'bm'|'zh' app language code. Defaults to "en-US". */
  lang?: string;
  /**
   * Called with the latest transcript every time recognition produces a
   * result (interim or final) — pass a setState function (e.g. `setInput`)
   * directly to populate a text input as the user speaks, without an effect
   * watching the returned `transcript` value. This is the pattern React's
   * own set-state-in-effect guidance recommends: call setState in a
   * callback when an external system changes, not in a useEffect that
   * re-derives it — see hooks/__tests__ and the two mount points for why
   * this exists (a useEffect version of this trips
   * react-hooks/set-state-in-effect and, worse, can't distinguish "the
   * user edited the input after stopping" from "a stray transcript update
   * fired").
   */
  onTranscriptChange?: (transcript: string) => void;
}

export interface UseSpeechInputResult {
  /** false when the API isn't available in this browser — callers must hide the mic button entirely, never render it disabled-with-no-explanation. */
  isSupported: boolean;
  isListening: boolean;
  /** The recognized text so far (interim results included, so it updates live while speaking). */
  transcript: string;
  start: () => void;
  stop: () => void;
  error: SpeechInputErrorKind | null;
}

/**
 * One shared speech-to-text hook — see this file's header. Never throws;
 * every failure path (unsupported browser, permission denied, no speech,
 * network, start() called in a bad state) resolves to `error` being set,
 * not an exception reaching the caller.
 */
export function useSpeechInput({ lang, onTranscriptChange }: UseSpeechInputOptions = {}): UseSpeechInputResult {
  const [isSupported] = useState(isSpeechInputSupported);
  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [error, setError] = useState<SpeechInputErrorKind | null>(null);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);

  // Kept current via an effect (React Compiler's react-hooks/refs rule
  // disallows writing a ref during render itself, even for this "latest
  // callback" pattern — a ref write belongs in an effect or event handler)
  // so the onresult handler below — set up once per start() call — always
  // calls the LATEST callback identity, not a stale one captured when
  // start() ran.
  const onTranscriptChangeRef = useRef(onTranscriptChange);
  useEffect(() => {
    onTranscriptChangeRef.current = onTranscriptChange;
  });

  // Detach handlers and abort on unmount — a stray onresult/onerror firing
  // after unmount would otherwise try to setState on a gone component.
  useEffect(() => {
    return () => {
      const recognition = recognitionRef.current;
      if (recognition) {
        recognition.onresult = null;
        recognition.onerror = null;
        recognition.onend = null;
        recognition.abort();
      }
      recognitionRef.current = null;
    };
  }, []);

  const start = useCallback(() => {
    if (isListening) return; // already capturing — a second start() is a no-op, not a restart
    const Ctor = getSpeechRecognitionConstructor();
    if (!Ctor) return; // isSupported already gates the button; this is defense-in-depth, never a throw

    setError(null);
    setTranscript('');

    const recognition = new Ctor();
    recognition.lang = lang || 'en-US';
    recognition.interimResults = true; // spec: user sees words appear live
    recognition.continuous = false; // one utterance, then auto-stop on silence — matches "tap, speak, review, send"

    recognition.onresult = (event) => {
      let combined = '';
      for (let i = 0; i < event.results.length; i++) {
        combined += event.results[i][0]?.transcript ?? '';
      }
      setTranscript(combined);
      // Direct callback call in response to the real external event (a
      // speech-recognition result), not a setState-in-effect — see the
      // option's own doc comment.
      onTranscriptChangeRef.current?.(combined);
    };
    recognition.onerror = (event) => {
      setError(mapSpeechRecognitionError(event.error));
      setIsListening(false);
    };
    recognition.onend = () => {
      setIsListening(false); // covers both auto-stop-on-silence and a manual stop()
    };

    recognitionRef.current = recognition;
    try {
      recognition.start();
      setIsListening(true);
    } catch {
      // Some engines throw synchronously if start() is called while already
      // active elsewhere — never let that reach the caller as a crash.
      setError('unknown');
      recognitionRef.current = null;
    }
  }, [isListening, lang]);

  const stop = useCallback(() => {
    recognitionRef.current?.stop(); // triggers onend -> setIsListening(false)
  }, []);

  return { isSupported, isListening, transcript, start, stop, error };
}
