// Admin-managed profanity/slur words, supplementing the curated hardcoded
// lists in wordlists.ts. Plain query per call, no manual cache — mirrors
// lib/chatbot/settings.ts::getSimilarityThreshold()'s pattern.

import type { SupabaseClient } from '@supabase/supabase-js';

export type CustomWordCategory = 'profanity' | 'slur';

export interface CustomWord {
  id: string;
  term: string;
  category: CustomWordCategory;
  language: string | null;
  isActive: boolean;
  createdAt: string;
}

type Row = {
  id: string;
  term: string;
  category: string;
  language: string | null;
  is_active: boolean;
  created_at: string;
};

function toCustomWord(row: Row): CustomWord {
  return {
    id: row.id,
    term: row.term,
    category: row.category === 'slur' ? 'slur' : 'profanity',
    language: row.language,
    isActive: row.is_active,
    createdAt: row.created_at,
  };
}

export async function listCustomWords(service: SupabaseClient): Promise<CustomWord[]> {
  const { data } = await service
    .from('moderation_custom_words')
    .select('id, term, category, language, is_active, created_at')
    .order('created_at', { ascending: false });
  return (data ?? []).map((row) => toCustomWord(row as Row));
}

export type AddCustomWordResult = { ok: true; word: CustomWord } | { ok: false; error: string };

export async function addCustomWord(
  service: SupabaseClient,
  input: { term: string; category: CustomWordCategory; language?: string | null; createdBy: string },
): Promise<AddCustomWordResult> {
  const term = input.term.trim();
  if (!term) return { ok: false, error: 'Word cannot be empty' };

  const { data, error } = await service
    .from('moderation_custom_words')
    .insert({
      term,
      category: input.category,
      language: input.language?.trim() || null,
      created_by: input.createdBy,
    })
    .select('id, term, category, language, is_active, created_at')
    .single();

  if (error) {
    // unique_violation on the lower(term) index
    if (error.code === '23505') return { ok: false, error: 'This word is already on the list' };
    return { ok: false, error: error.message };
  }
  return { ok: true, word: toCustomWord(data as Row) };
}

export async function removeCustomWord(service: SupabaseClient, id: string): Promise<void> {
  await service.from('moderation_custom_words').delete().eq('id', id);
}

export async function setCustomWordActive(service: SupabaseClient, id: string, isActive: boolean): Promise<void> {
  await service.from('moderation_custom_words').update({ is_active: isActive }).eq('id', id);
}

/** Active words only, grouped by category — what the maskers actually consume. */
export async function getActiveTermsByCategory(
  service: SupabaseClient,
): Promise<{ profanity: string[]; slur: string[] }> {
  const { data } = await service
    .from('moderation_custom_words')
    .select('term, category')
    .eq('is_active', true);

  const result = { profanity: [] as string[], slur: [] as string[] };
  for (const row of (data ?? []) as { term: string; category: string }[]) {
    if (row.category === 'slur') result.slur.push(row.term);
    else result.profanity.push(row.term);
  }
  return result;
}
