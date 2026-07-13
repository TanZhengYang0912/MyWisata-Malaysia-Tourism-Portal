// P4 — Member 4: RAG retrieval. CLAUDE-PHASE2.md Feature A.
//
// Vector ops (cosine distance) happen in Postgres via the match_kb_documents
// RPC (migration 014) rather than client-side, per the spec's own
// suggestion ("Expose it as a Supabase RPC if the client can't do vector ops
// directly") — supabase-js has no vector operator support.

import type { SupabaseClient } from '@supabase/supabase-js';
import { embedText } from './embed';
import { getSimilarityThreshold } from './settings';

export interface RetrievedDoc {
  id: string;
  title: string;
  body: string;
  category: string | null;
  similarity: number;
}

/**
 * Embeds the question and finds the top-k KB docs by cosine similarity.
 * Returns [] if the BEST match is below the threshold — per CLAUDE-PHASE2.md
 * Section 2, that's the signal to skip the LLM call entirely, not just to
 * drop the weak result and keep going. Throws (rather than swallowing) on
 * embedding/RPC failure — lib/chatbot/answer.ts is responsible for catching
 * this and falling back to the keyword matcher.
 */
export async function retrieve(service: SupabaseClient, question: string, k = 3): Promise<RetrievedDoc[]> {
  const [embedding, threshold] = await Promise.all([embedText(question), getSimilarityThreshold(service)]);

  const { data, error } = await service.rpc('match_kb_documents', {
    query_embedding: embedding,
    match_count: k,
  });
  if (error) throw new Error(`match_kb_documents RPC failed: ${error.message}`);

  const rows = (data ?? []) as { id: string; title: string; body: string; category: string | null; similarity: number }[];
  if (rows.length === 0 || rows[0].similarity < threshold) return [];

  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    body: r.body,
    category: r.category,
    similarity: Number(r.similarity),
  }));
}
