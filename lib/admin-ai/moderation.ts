// P4 — Member 4: moderation assistant. CLAUDE-ADMIN-AI.md Part 2, Capability 3.
//
// Read-only overlay on vendor_recommendations (another member's table — see
// the route for the read; nothing in this file or its caller ever writes to
// that table). Advisory only: returns a structured assessment, never a
// verdict, never auto-approves/rejects.

import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { callGemini } from './gemini';

const SYSTEM_PROMPT = `You are a moderation assistant for MyWisata's admin team, reviewing a
community-submitted vendor recommendation. You are ADVISORY ONLY — you never approve, reject, or
issue a verdict. You give the human reviewer a structured read to help them decide.

Assess:
- completeness: is the submission missing information a reviewer would need (address, description, category)?
- qualityNotes: brief notes on how well-written/plausible the submission is.
- riskFlag: "low_risk" or "needs_review" — needs_review if something looks off (vague, spammy,
  suspiciously similar to an existing entry, or clearly incomplete).

You are given a DUPLICATE SIGNAL computed separately (not by you) — a fuzzy name-match count
against existing submissions. Incorporate it into duplicateLikelihood ("low"/"medium"/"high"); do
not guess your own duplicate assessment from the text alone.

Respond with ONLY strict JSON, no markdown:
{"completeness": "...", "duplicateLikelihood": "low"|"medium"|"high", "qualityNotes": "...", "riskFlag": "low_risk"|"needs_review"}`;

export interface ModerationAssessment {
  completeness: string;
  duplicateLikelihood: 'low' | 'medium' | 'high';
  qualityNotes: string;
  riskFlag: 'low_risk' | 'needs_review';
}

const assessmentSchema = z.object({
  completeness: z.string(),
  duplicateLikelihood: z.enum(['low', 'medium', 'high']),
  qualityNotes: z.string(),
  riskFlag: z.enum(['low_risk', 'needs_review']),
}).strict();

function extractJson(text: string): unknown {
  const stripped = text.replace(/```json\s*|```/g, '').trim();
  return JSON.parse(stripped);
}

/**
 * Fuzzy duplicate signal — count of OTHER non-rejected recommendations
 * whose normalized name matches this one. Aggregate count only, never the
 * other submitters' identities (CLAUDE-ADMIN-AI.md: "compare against
 * existing vendor names — aggregate/fuzzy, not by exposing other users' data").
 */
async function duplicateSignal(service: SupabaseClient, recommendationId: string, normalizedName: string | null): Promise<number> {
  if (!normalizedName) return 0;
  const { count, error } = await service
    .from('vendor_recommendations')
    .select('id', { count: 'exact', head: true })
    .eq('vendor_name_normalized', normalizedName)
    .neq('id', recommendationId)
    .neq('status', 'rejected');
  if (error) throw new Error(error.message);
  return count ?? 0;
}

export async function reviewRecommendation(service: SupabaseClient, recommendationId: string): Promise<ModerationAssessment> {
  const { data: rec, error } = await service
    .from('vendor_recommendations')
    .select('vendor_name, vendor_name_normalized, vendor_address, description, state, category_id')
    .eq('id', recommendationId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!rec) throw new Error('recommendation_not_found');

  const dupCount = await duplicateSignal(service, recommendationId, rec.vendor_name_normalized);

  const submissionText = [
    `Vendor name: ${rec.vendor_name}`,
    `State: ${rec.state ?? '(not provided)'}`,
    `Address: ${rec.vendor_address ?? '(not provided)'}`,
    `Description: ${rec.description ?? '(not provided)'}`,
    `DUPLICATE SIGNAL: ${dupCount} other active submission(s) with a matching normalized name.`,
  ].join('\n');

  const raw = await callGemini(SYSTEM_PROMPT, submissionText, { temperature: 0, maxOutputTokens: 300 });
  const parsed = assessmentSchema.safeParse(extractJson(raw));
  if (!parsed.success) throw new Error('moderation_assessment_malformed');
  return parsed.data;
}
