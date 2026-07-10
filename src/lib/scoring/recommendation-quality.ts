// P-TMF (Trust & Money Flow) — TMF-2 Recommendation Trust
// Rule-based composite score. Renamed from "AI recommendation quality scoring".
// Weights: completeness 0.4 + description quality 0.3 + (1 - duplicate risk) 0.3

import type { SupabaseClient } from '@supabase/supabase-js';
import type { VendorRecommendationRow } from '@/types/database';

export interface QualityScoreResult {
  score: number;          // 0..1
  breakdown: {
    completeness: number;
    descQuality:  number;
    duplicateRisk: number;
  };
  version: 'rule-v1' | 'heuristic-v1';
  reasons: string[];      // human-readable, shown to admin
}

/**
 * Compute quality score for a vendor recommendation submission.
 * Returns a breakdown so admins can see WHY the score is what it is.
 * This is NOT ML — three weighted heuristics.
 */
export async function recommendationQualityScore(
  rec: VendorRecommendationRow,
  db: SupabaseClient,
): Promise<QualityScoreResult> {
  // 1. Completeness — how many of the 4 key fields are filled
  const fields = [rec.vendor_name, rec.vendor_address, rec.description, rec.category_id];
  const completeness = fields.filter(Boolean).length / fields.length;

  // 2. Description quality — length + word count (heuristic-v1)
  const desc = rec.description ?? '';
  const lengthScore = Math.min(desc.length / 200, 1);
  const wordScore   = Math.min(desc.trim().split(/\s+/).filter(Boolean).length / 30, 1);
  const descQuality = (lengthScore + wordScore) / 2;

  // 3. Duplicate risk — similar submissions from same recommender in last 30d
  const namePrefix = rec.vendor_name.slice(0, 10);
  const { count } = await db
    .from('vendor_recommendations')
    .select('id', { count: 'exact', head: true })
    .eq('recommender_id', rec.recommender_id)
    .ilike('vendor_name', `%${namePrefix}%`)
    .neq('id', rec.id)
    .gte('created_at', new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString());
  const duplicateRisk = Math.min((count ?? 0) / 3, 1);

  const score = 0.4 * completeness + 0.3 * descQuality + 0.3 * (1 - duplicateRisk);

  const reasons: string[] = [];
  if (completeness < 0.75)  reasons.push(`Missing ${Math.round((1 - completeness) * fields.length)} field(s)`);
  if (descQuality  < 0.5)   reasons.push('Description is too short or sparse');
  if (duplicateRisk > 0.3)  reasons.push(`Recommender has ${count} similar past submissions`);
  if (reasons.length === 0) reasons.push('All quality checks passed');

  return {
    score: Math.round(score * 100) / 100,
    breakdown: {
      completeness: Math.round(completeness * 100) / 100,
      descQuality:  Math.round(descQuality  * 100) / 100,
      duplicateRisk: Math.round(duplicateRisk * 100) / 100,
    },
    version: 'rule-v1',
    reasons,
  };
}

/**
 * Fast SQL-only duplicate flag — used at submission time to warn user.
 * Bypasses full scoring for immediate feedback.
 */
export async function isDuplicateSubmission(
  recommenderId: string,
  vendorName: string,
  db: SupabaseClient,
): Promise<{ isDuplicate: boolean; count: number }> {
  const { count } = await db
    .from('vendor_recommendations')
    .select('id', { count: 'exact', head: true })
    .eq('recommender_id', recommenderId)
    .ilike('vendor_name', `%${vendorName.slice(0, 10)}%`)
    .gte('created_at', new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString());

  return {
    isDuplicate: (count ?? 0) >= 5,   // 5+ similar in 7d = suspicious
    count: count ?? 0,
  };
}
