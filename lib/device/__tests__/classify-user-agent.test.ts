import { describe, expect, it } from 'vitest';
import { classifyUserAgent } from '../classify-user-agent';

describe('classifyUserAgent', () => {
  it('classifies an iPhone as mobile', () => {
    expect(classifyUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15')).toBe('mobile');
  });

  it('classifies an Android phone as mobile', () => {
    expect(classifyUserAgent('Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Mobile Safari/537.36')).toBe('mobile');
  });

  it('classifies an iPad as tablet', () => {
    expect(classifyUserAgent('Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/605.1.15')).toBe('tablet');
  });

  it('classifies an Android tablet (no "Mobile" token) as tablet', () => {
    expect(classifyUserAgent('Mozilla/5.0 (Linux; Android 14; SM-X910) AppleWebKit/537.36 Safari/537.36')).toBe('tablet');
  });

  it('classifies Windows desktop as desktop', () => {
    expect(classifyUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36')).toBe('desktop');
  });

  it('classifies macOS desktop as desktop', () => {
    expect(classifyUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15')).toBe('desktop');
  });

  it('returns unknown for a missing or unrecognized user agent', () => {
    expect(classifyUserAgent(null)).toBe('unknown');
    expect(classifyUserAgent(undefined)).toBe('unknown');
    expect(classifyUserAgent('SomeBotCrawler/1.0')).toBe('unknown');
  });
});
