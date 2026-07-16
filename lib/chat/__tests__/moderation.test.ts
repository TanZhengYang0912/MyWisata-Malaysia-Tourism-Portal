import { describe, expect, it } from 'vitest';
import { maskChatBody } from '@/lib/chat/moderation';

describe('maskChatBody', () => {
  it('masks a Malaysian mobile number with dashes', () => {
    const result = maskChatBody('call me at 012-3456789 please');
    expect(result.clean).not.toContain('012-3456789');
    expect(result.clean).toContain('••••••');
    expect(result.flags).toContain('phone');
  });

  it('masks a Malaysian landline with a space', () => {
    const result = maskChatBody('office line 03-1234 5678');
    expect(result.clean).not.toContain('1234 5678');
    expect(result.flags).toContain('phone');
  });

  it('masks a +60 international format number', () => {
    const result = maskChatBody('whatsapp +60 12 345 6789 anytime');
    expect(result.clean).not.toMatch(/\d{4}\s*\d{4}/);
    expect(result.flags).toContain('phone');
  });

  it('masks an email address', () => {
    const result = maskChatBody('reach me at alice@example.com ok');
    expect(result.clean).not.toContain('alice@example.com');
    expect(result.flags).toContain('email');
  });

  it('masks a URL', () => {
    const result = maskChatBody('check https://example.com/deal for info');
    expect(result.clean).not.toContain('https://example.com/deal');
    expect(result.flags).toContain('link');
  });

  it('masks a wa.me / whatsapp mention', () => {
    const result = maskChatBody('just wa.me/60123456789 me directly');
    expect(result.clean).not.toContain('wa.me');
    expect(result.flags).toContain('link');
  });

  it('masks an Instagram-style handle', () => {
    const result = maskChatBody('follow my ig @traveldeals_my for more');
    expect(result.clean).not.toContain('@traveldeals_my');
    expect(result.flags).toContain('link');
  });

  it('masks English profanity on word boundaries', () => {
    const result = maskChatBody('this is shit service honestly');
    expect(result.clean).not.toMatch(/\bshit\b/i);
    expect(result.clean).toContain('****');
    expect(result.flags).toContain('profanity');
  });

  it('masks common Malay profanity', () => {
    const result = maskChatBody('bodoh punya vendor never reply');
    expect(result.clean).not.toMatch(/\bbodoh\b/i);
    expect(result.flags).toContain('profanity');
  });

  it('leaves clean text completely untouched', () => {
    const result = maskChatBody('Is this activity suitable for a 6 year old?');
    expect(result.clean).toBe('Is this activity suitable for a 6 year old?');
    expect(result.flags).toEqual([]);
  });

  it('does not mask short numbers like prices', () => {
    const result = maskChatBody('the price is RM 42 for adults');
    expect(result.clean).toBe('the price is RM 42 for adults');
    expect(result.flags).toEqual([]);
  });

  it('reports multiple flags when several categories appear in one message', () => {
    const result = maskChatBody('call 012-3456789 or email a@b.com, this is bodoh');
    expect(result.flags).toContain('phone');
    expect(result.flags).toContain('email');
    expect(result.flags).toContain('profanity');
  });
});
