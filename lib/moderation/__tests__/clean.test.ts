import { describe, expect, it } from 'vitest';
import { cleanUserContent } from '../clean';

describe('cleanUserContent', () => {
  it('masks profanity in display but keeps it real in original', () => {
    const r = cleanUserContent('this fucking withdrawal is broken');
    expect(r.display).toContain('f***');
    expect(r.original).toContain('fucking');
    expect(r.hadProfanity).toBe(true);
    expect(r.hadSlur).toBe(false);
    expect(r.severity).toBe('low');
  });

  it('never leaves raw PII in either display or original', () => {
    const r = cleanUserContent('my IC is 990101-14-5678');
    expect(r.display).not.toContain('990101-14-5678');
    expect(r.original).not.toContain('990101-14-5678');
    expect(r.display).toContain('[IC]');
    expect(r.original).toContain('[IC]');
    expect(r.hadPII).toBe(true);
  });

  it('marks slurs as high severity', () => {
    const r = cleanUserContent('you fucking nigger');
    expect(r.hadSlur).toBe(true);
    expect(r.severity).toBe('high');
    expect(r.display).not.toContain('nigger');
  });

  it('leaves clean text untouched in both fields', () => {
    const r = cleanUserContent('how do I withdraw my earnings?');
    expect(r.display).toBe('how do I withdraw my earnings?');
    expect(r.original).toBe('how do I withdraw my earnings?');
    expect(r.severity).toBe('none');
  });

  it('never rejects — always returns a usable string for any input', () => {
    const r = cleanUserContent('');
    expect(typeof r.display).toBe('string');
    expect(typeof r.original).toBe('string');
  });
});
