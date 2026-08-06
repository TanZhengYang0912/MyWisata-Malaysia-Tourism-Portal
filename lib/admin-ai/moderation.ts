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

export type RecommendationEvidenceField =
  | 'vendor_name'
  | 'description'
  | 'why_recommend'
  | 'category'
  | 'location'
  | 'contact'
  | 'photos'
  | 'image_attestation'
  | 'duplicate';

export type EvidenceCheckStatus =
  | 'passed'
  | 'missing'
  | 'invalid'
  | 'low_quality'
  | 'needs_manual_review';

export interface EvidenceCheck {
  field: RecommendationEvidenceField;
  label: string;
  status: EvidenceCheckStatus;
  message: string;
}

export interface ModerationFinding {
  field: RecommendationEvidenceField;
  severity: 'low' | 'medium' | 'high';
  kind: 'low_quality' | 'conflict' | 'spam' | 'test_content' | 'policy' | 'duplicate' | 'manual_review';
  message: string;
  evidenceSummary: string | null;
}

export interface PhotoAssessment {
  imageId: string;
  status: 'appears_relevant' | 'possible_conflict' | 'unclear' | 'could_not_analyse';
  message: string;
}

export interface AiModerationResult {
  suggestedAction: 'approve' | 'request_changes' | 'reject';
  confidence: 'low' | 'medium' | 'high';
  findings: ModerationFinding[];
  feedbackDraft: string | null;
  photoAssessments: PhotoAssessment[];
}

export interface ModerationAssessment {
  suggestedAction: AiModerationResult['suggestedAction'] | null;
  confidence: AiModerationResult['confidence'] | null;
  evidenceChecks: EvidenceCheck[];
  findings: ModerationFinding[];
  duplicateCount: number;
  duplicateBasis: 'exact_normalized_name';
  feedbackDraft: string | null;
  photoAssessments: PhotoAssessment[];
  aiAvailable: boolean;
}

export interface RecommendationEvidenceRow {
  id: string;
  vendor_name: string | null;
  vendor_name_normalized: string | null;
  description: string | null;
  why_recommend: string | null;
  category_id: string | null;
  categories: { name: string | null } | { name: string | null }[] | null;
  google_place_id: string | null;
  location_name: string | null;
  formatted_address: string | null;
  latitude: number | null;
  longitude: number | null;
  contact_phone: string | null;
  contact_email: string | null;
  contact_website: string | null;
  image_attested_at: string | null;
  state?: string | null;
}

export const aiResultSchema = z.object({
  suggestedAction: z.enum(['approve', 'request_changes', 'reject']),
  confidence: z.enum(['low', 'medium', 'high']),
  findings: z.array(z.object({
    field: z.enum([
      'vendor_name', 'description', 'why_recommend', 'category',
      'location', 'contact', 'photos', 'image_attestation', 'duplicate',
    ]),
    severity: z.enum(['low', 'medium', 'high']),
    kind: z.enum(['low_quality', 'conflict', 'spam', 'test_content', 'policy', 'duplicate', 'manual_review']),
    message: z.string().trim().min(1).max(300),
    evidenceSummary: z.string().trim().max(200).nullable(),
  }).strict()).max(20),
  feedbackDraft: z.string().trim().max(500).nullable(),
  photoAssessments: z.array(z.object({
    imageId: z.string().uuid(),
    status: z.enum(['appears_relevant', 'possible_conflict', 'unclear', 'could_not_analyse']),
    message: z.string().trim().min(1).max(300),
  }).strict()).max(5),
}).strict();

function checkText(
  field: Extract<RecommendationEvidenceField, 'vendor_name' | 'description' | 'why_recommend'>,
  label: string,
  value: string | null,
  minimumLength: number,
): EvidenceCheck {
  const text = value?.trim() ?? '';
  if (!text) {
    return {
      field,
      label,
      status: 'missing',
      message: `${label} is not available.`,
    };
  }
  if (text.length < minimumLength) {
    return {
      field,
      label,
      status: 'low_quality',
      message: `${label} must be at least ${minimumLength} characters.`,
    };
  }
  return {
    field,
    label,
    status: 'passed',
    message: `${label} is present.`,
  };
}

export function buildEvidenceChecks(
  row: RecommendationEvidenceRow,
  imageCount: number,
  duplicateCount: number,
): EvidenceCheck[] {
  const categoryName = (Array.isArray(row.categories)
    ? row.categories[0]?.name
    : row.categories?.name)?.trim();
  const hasLocation = Boolean(
    row.location_name?.trim()
    && row.formatted_address?.trim()
    && Number.isFinite(row.latitude)
    && Number.isFinite(row.longitude),
  );
  const hasContact = Boolean(
    row.contact_phone?.trim()
    || row.contact_email?.trim()
    || row.contact_website?.trim(),
  );
  const imageAttestation = row.image_attested_at?.trim();

  return [
    checkText('vendor_name', 'Business name', row.vendor_name, 3),
    checkText('description', 'Description', row.description, 20),
    checkText('why_recommend', 'Recommendation reason', row.why_recommend, 20),
    {
      field: 'category',
      label: 'Category',
      status: categoryName ? 'passed' : 'missing',
      message: categoryName ? `Category: ${categoryName}` : 'Category is not available.',
    },
    {
      field: 'location',
      label: 'Google location',
      status: hasLocation ? 'passed' : 'missing',
      message: hasLocation ? 'Google location evidence is complete.' : 'Google location evidence is incomplete.',
    },
    {
      field: 'contact',
      label: 'Contact method',
      status: hasContact ? 'passed' : 'missing',
      message: hasContact ? 'At least one contact method is present.' : 'No contact method is present.',
    },
    {
      field: 'photos',
      label: 'Photos',
      status: imageCount >= 1 && imageCount <= 5 ? 'passed' : 'missing',
      message: `${imageCount} active photo${imageCount === 1 ? '' : 's'} attached.`,
    },
    {
      field: 'image_attestation',
      label: 'Image rights',
      status: imageAttestation ? 'passed' : 'missing',
      message: imageAttestation ? 'Image rights were attested.' : 'Image rights attestation is missing.',
    },
    {
      field: 'duplicate',
      label: 'Exact name matches',
      status: duplicateCount > 0 ? 'needs_manual_review' : 'passed',
      message: `${duplicateCount} exact normalized-name match${duplicateCount === 1 ? '' : 'es'}.`,
    },
  ];
}

const REJECT_KINDS = new Set<ModerationFinding['kind']>([
  'spam', 'test_content', 'policy', 'duplicate',
]);

export function applyDecisionGuardrails(
  ai: AiModerationResult,
  checks: EvidenceCheck[],
  duplicateCount: number,
): Pick<ModerationAssessment, 'suggestedAction' | 'confidence' | 'feedbackDraft'> {
  const requiredIssue = checks.some((check) =>
    ['missing', 'invalid', 'low_quality'].includes(check.status));
  const photoConflict = ai.photoAssessments.some((photo) => photo.status === 'possible_conflict');
  const highFinding = ai.findings.some((finding) => finding.severity === 'high');
  const deterministicDuplicateBasis = duplicateCount >= 2;
  const rejectBasis = deterministicDuplicateBasis || ai.findings.some((finding) =>
    finding.severity === 'high'
    && finding.kind !== 'duplicate'
    && REJECT_KINDS.has(finding.kind));

  let suggestedAction = ai.suggestedAction;
  if (requiredIssue) {
    suggestedAction = 'request_changes';
  }
  if (suggestedAction === 'reject' && !rejectBasis) {
    suggestedAction = 'request_changes';
  }
  if (suggestedAction === 'approve' && (photoConflict || highFinding)) {
    suggestedAction = 'request_changes';
  }

  return {
    suggestedAction,
    confidence: ai.confidence,
    feedbackDraft: suggestedAction === 'approve' ? null : ai.feedbackDraft,
  };
}

interface LegacyModerationAssessment {
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

export async function reviewRecommendation(service: SupabaseClient, recommendationId: string): Promise<LegacyModerationAssessment> {
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
