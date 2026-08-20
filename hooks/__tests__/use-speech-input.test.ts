import { afterEach, describe, expect, it, vi } from 'vitest';
import { isSpeechInputSupported, mapSpeechRecognitionError, resolveRecognitionLang } from '../use-speech-input';

// This project's vitest environment is 'node' by default (no React Testing
// Library / jsdom wired in — matches the rest of the repo, which verifies
// React components live rather than with a renderer). So this file tests
// only the hook's pure, non-React logic — the feature-detection, error-code
// mapping, and language-resolution helpers the hook itself is built from.
// The stateful hook (useState/useEffect/useCallback wiring) is verified by
// code review plus live browser verification once Parts 2/3 mount it,
// exactly like every other client component in this codebase.

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('isSpeechInputSupported', () => {
  it('is false when window is not defined (SSR / node)', () => {
    vi.stubGlobal('window', undefined);
    expect(isSpeechInputSupported()).toBe(false);
  });

  it('is false when window exists but neither constructor is present (e.g. Firefox)', () => {
    vi.stubGlobal('window', {});
    expect(isSpeechInputSupported()).toBe(false);
  });

  it('is true when window.SpeechRecognition is present', () => {
    vi.stubGlobal('window', { SpeechRecognition: function SpeechRecognition() {} });
    expect(isSpeechInputSupported()).toBe(true);
  });

  it('is true when only the webkit-prefixed constructor is present (Safari/older Chrome)', () => {
    vi.stubGlobal('window', { webkitSpeechRecognition: function webkitSpeechRecognition() {} });
    expect(isSpeechInputSupported()).toBe(true);
  });
});

describe('mapSpeechRecognitionError', () => {
  it.each([
    ['not-allowed', 'permission-denied'],
    ['service-not-allowed', 'permission-denied'],
    ['no-speech', 'no-speech'],
    ['network', 'network'],
  ] as const)('maps %s -> %s', (code, expected) => {
    expect(mapSpeechRecognitionError(code)).toBe(expected);
  });

  it('maps an unrecognized code to "unknown" rather than throwing', () => {
    expect(mapSpeechRecognitionError('audio-capture')).toBe('unknown');
    expect(mapSpeechRecognitionError('aborted')).toBe('unknown');
    expect(mapSpeechRecognitionError('some-future-error-code')).toBe('unknown');
  });
});

describe('resolveRecognitionLang', () => {
  it.each([
    ['en', 'en-US'],
    ['bm', 'ms-MY'],
    ['zh', 'zh-CN'],
  ] as const)('resolves %s -> %s', (appLang, expected) => {
    expect(resolveRecognitionLang(appLang)).toBe(expected);
  });

  it('defaults to en-US for null, undefined, or an unrecognized code', () => {
    expect(resolveRecognitionLang(null)).toBe('en-US');
    expect(resolveRecognitionLang(undefined)).toBe('en-US');
    expect(resolveRecognitionLang('fr')).toBe('en-US');
  });
});
