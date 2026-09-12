import { describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { maskChatBody } from '@/lib/chat/moderation';

function mockService(customWords: { term: string; category: string }[] = []): SupabaseClient {
  return {
    from: () => ({
      select: () => ({
        eq: () => Promise.resolve({ data: customWords }),
      }),
    }),
  } as unknown as SupabaseClient;
}

describe('maskChatBody', () => {
  it('masks a Malaysian mobile number with dashes', async () => {
    const result = await maskChatBody('call me at 012-3456789 please', mockService());
    expect(result.clean).not.toContain('012-3456789');
    expect(result.clean).toContain('••••••');
    expect(result.flags).toContain('phone');
  });

  it('masks a Malaysian landline with a space', async () => {
    const result = await maskChatBody('office line 03-1234 5678', mockService());
    expect(result.clean).not.toContain('1234 5678');
    expect(result.flags).toContain('phone');
  });

  it('masks a +60 international format number', async () => {
    const result = await maskChatBody('whatsapp +60 12 345 6789 anytime', mockService());
    expect(result.clean).not.toMatch(/\d{4}\s*\d{4}/);
    expect(result.flags).toContain('phone');
  });

  it('masks an email address', async () => {
    const result = await maskChatBody('reach me at alice@example.com ok', mockService());
    expect(result.clean).not.toContain('alice@example.com');
    expect(result.flags).toContain('email');
  });

  it('masks a URL', async () => {
    const result = await maskChatBody('check https://example.com/deal for info', mockService());
    expect(result.clean).not.toContain('https://example.com/deal');
    expect(result.flags).toContain('link');
  });

  it('masks a wa.me / whatsapp mention', async () => {
    const result = await maskChatBody('just wa.me/60123456789 me directly', mockService());
    expect(result.clean).not.toContain('wa.me');
    expect(result.flags).toContain('link');
  });

  it('masks an Instagram-style handle', async () => {
    const result = await maskChatBody('follow my ig @traveldeals_my for more', mockService());
    expect(result.clean).not.toContain('@traveldeals_my');
    expect(result.flags).toContain('link');
  });

  it('masks English profanity on word boundaries', async () => {
    const result = await maskChatBody('this is shit service honestly', mockService());
    expect(result.clean).not.toMatch(/\bshit\b/i);
    expect(result.clean).toContain('****');
    expect(result.flags).toContain('profanity');
  });

  it('masks common Malay profanity', async () => {
    const result = await maskChatBody('bodoh punya vendor never reply', mockService());
    expect(result.clean).not.toMatch(/\bbodoh\b/i);
    expect(result.flags).toContain('profanity');
  });

  it('leaves clean text completely untouched', async () => {
    const result = await maskChatBody('Is this activity suitable for a 6 year old?', mockService());
    expect(result.clean).toBe('Is this activity suitable for a 6 year old?');
    expect(result.flags).toEqual([]);
  });

  it('does not mask short numbers like prices', async () => {
    const result = await maskChatBody('the price is RM 42 for adults', mockService());
    expect(result.clean).toBe('the price is RM 42 for adults');
    expect(result.flags).toEqual([]);
  });

  it('reports multiple flags when several categories appear in one message', async () => {
    const result = await maskChatBody('call 012-3456789 or email a@b.com, this is bodoh', mockService());
    expect(result.flags).toContain('phone');
    expect(result.flags).toContain('email');
    expect(result.flags).toContain('profanity');
  });

  it('masks an admin-added word in a non-Latin script', async () => {
    const result = await maskChatBody('你是一个笨蛋卖家', mockService([{ term: '笨蛋', category: 'profanity' }]));
    expect(result.clean).not.toContain('笨蛋');
    expect(result.flags).toContain('profanity');
  });
});
