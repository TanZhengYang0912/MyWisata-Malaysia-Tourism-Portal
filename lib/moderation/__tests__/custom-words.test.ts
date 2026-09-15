import { describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { addCustomWord, getActiveTermsByCategory, listCustomWords, removeCustomWord, setCustomWordActive } from '../custom-words';

const ROW = { id: 'w1', term: 'bengkok', category: 'slur', language: 'ms', is_active: true, created_at: '2026-09-12T00:00:00Z' };

describe('listCustomWords', () => {
  it('maps rows to CustomWord, newest first', async () => {
    const order = vi.fn().mockResolvedValue({ data: [ROW] });
    const service = { from: () => ({ select: () => ({ order }) }) } as unknown as SupabaseClient;
    const words = await listCustomWords(service);
    expect(words).toEqual([{ id: 'w1', term: 'bengkok', category: 'slur', language: 'ms', isActive: true, createdAt: '2026-09-12T00:00:00Z' }]);
  });
});

describe('addCustomWord', () => {
  it('inserts and returns the created word', async () => {
    const single = vi.fn().mockResolvedValue({ data: ROW, error: null });
    const service = { from: () => ({ insert: () => ({ select: () => ({ single }) }) }) } as unknown as SupabaseClient;
    const result = await addCustomWord(service, { term: 'bengkok', category: 'slur', language: 'ms', createdBy: 'admin-1' });
    expect(result).toEqual({ ok: true, word: expect.objectContaining({ term: 'bengkok' }) });
  });

  it('rejects an empty term without touching the database', async () => {
    const service = { from: vi.fn() } as unknown as SupabaseClient;
    const result = await addCustomWord(service, { term: '   ', category: 'profanity', createdBy: 'admin-1' });
    expect(result).toEqual({ ok: false, error: 'Word cannot be empty' });
  });

  it('turns a unique-violation into a friendly duplicate error', async () => {
    const single = vi.fn().mockResolvedValue({ data: null, error: { code: '23505', message: 'duplicate key' } });
    const service = { from: () => ({ insert: () => ({ select: () => ({ single }) }) }) } as unknown as SupabaseClient;
    const result = await addCustomWord(service, { term: 'bengkok', category: 'slur', createdBy: 'admin-1' });
    expect(result).toEqual({ ok: false, error: 'This word is already on the list' });
  });
});

describe('removeCustomWord / setCustomWordActive', () => {
  it('deletes by id', async () => {
    const eq = vi.fn().mockResolvedValue({ error: null });
    const service = { from: () => ({ delete: () => ({ eq }) }) } as unknown as SupabaseClient;
    await removeCustomWord(service, 'w1');
    expect(eq).toHaveBeenCalledWith('id', 'w1');
  });

  it('toggles is_active', async () => {
    const eq = vi.fn().mockResolvedValue({ error: null });
    const update = vi.fn().mockReturnValue({ eq });
    const service = { from: () => ({ update }) } as unknown as SupabaseClient;
    await setCustomWordActive(service, 'w1', false);
    expect(update).toHaveBeenCalledWith({ is_active: false });
    expect(eq).toHaveBeenCalledWith('id', 'w1');
  });
});

describe('getActiveTermsByCategory', () => {
  it('groups active terms by category', async () => {
    const eq = vi.fn().mockResolvedValue({
      data: [
        { term: 'bengkok', category: 'slur' },
        { term: 'siot', category: 'profanity' },
      ],
    });
    const service = { from: () => ({ select: () => ({ eq }) }) } as unknown as SupabaseClient;
    const result = await getActiveTermsByCategory(service);
    expect(result).toEqual({ profanity: ['siot'], slur: ['bengkok'] });
  });

  it('returns empty arrays when there are no custom words', async () => {
    const eq = vi.fn().mockResolvedValue({ data: [] });
    const service = { from: () => ({ select: () => ({ eq }) }) } as unknown as SupabaseClient;
    const result = await getActiveTermsByCategory(service);
    expect(result).toEqual({ profanity: [], slur: [] });
  });
});
