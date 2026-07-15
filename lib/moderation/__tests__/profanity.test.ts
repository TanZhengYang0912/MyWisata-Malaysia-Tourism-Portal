import { describe, expect, it } from 'vitest';
import { maskProfanity } from '../profanity';

describe('maskProfanity', () => {
  it('masks profanity, keeping the first letter', () => {
    const r = maskProfanity('this is fucking broken');
    expect(r.masked).toBe('this is f****** broken');
    expect(r.hits).toEqual(['profanity']);
    expect(r.hadHits).toBe(true);
  });

  it('tags a slur as high severity via a separate category', () => {
    const r = maskProfanity('you fucking nigger');
    expect(r.hits).toContain('slur');
    expect(r.hits).toContain('profanity');
    expect(r.masked).not.toContain('nigger');
  });

  it('is Scunthorpe-safe — never masks a clean word containing a banned substring', () => {
    for (const clean of [
      'the assessment class discusses cockpits in Scunthorpe',
      'please assess the situation',
      'a classy cockpit design',
    ]) {
      const r = maskProfanity(clean);
      expect(r.masked).toBe(clean);
      expect(r.hadHits).toBe(false);
    }
  });

  it('handles spacing evasion', () => {
    const r = maskProfanity('f u c k this');
    expect(r.hadHits).toBe(true);
    expect(r.masked).not.toMatch(/f u c k/i);
  });

  it('handles leetspeak evasion', () => {
    const r = maskProfanity('sh1t happens');
    expect(r.hadHits).toBe(true);
    expect(r.masked).not.toContain('sh1t');
  });

  it('handles repeated-character evasion', () => {
    const r = maskProfanity('shiiiit');
    expect(r.hadHits).toBe(true);
    expect(r.masked[0]).toBe('s');
  });

  it('catches common inflections without reopening Scunthorpe', () => {
    const r1 = maskProfanity('bunch of bastards');
    expect(r1.hadHits).toBe(true);
    const r2 = maskProfanity('the assessment class discusses cockpits in Scunthorpe');
    expect(r2.hadHits).toBe(false);
  });

  it('leaves clean text untouched', () => {
    const r = maskProfanity('this is a perfectly clean sentence');
    expect(r.masked).toBe('this is a perfectly clean sentence');
    expect(r.hadHits).toBe(false);
    expect(r.hits).toEqual([]);
  });

  it('regex state does not leak between calls', () => {
    maskProfanity('this is fucking broken');
    const r = maskProfanity('this is fucking broken');
    expect(r.hadHits).toBe(true);
  });
});
