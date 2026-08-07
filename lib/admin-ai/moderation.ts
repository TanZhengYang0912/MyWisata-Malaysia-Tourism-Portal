// P4 — Member 4: moderation assistant. CLAUDE-ADMIN-AI.md Part 2, Capability 3.
//
// Read-only overlay on vendor_recommendations (another member's table — see
// the route for the read; nothing in this file or its caller ever writes to
// that table). Advisory only: returns a structured assessment, never a
// verdict, never auto-approves/rejects.

import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { redactPII } from '@/lib/chatbot/pii';
import { callGemini, type GeminiInlineImage } from './gemini';

export const RECOMMENDATION_PHOTO_TIMEOUT_MS = 10_000;
export const MAX_RECOMMENDATION_PHOTO_BYTES = 5 * 1024 * 1024;
export const MAX_GEMINI_IMAGE_PAYLOAD_BYTES = 8 * 1024 * 1024;

const MIN_FEEDBACK_DRAFT_LENGTH = 10;
const REQUEST_CHANGES_FEEDBACK = 'Please review the submitted evidence and provide any missing details before approval.';
const REJECT_FEEDBACK = 'This recommendation requires rejection based on the reviewed moderation evidence.';
const MANUAL_PHOTO_FEEDBACK = 'Please have a human reviewer assess the submitted photos before deciding this recommendation.';
const REJECTION_LANGUAGE = /\b(?:reject(?:ed|s|ing|ion)?|declin(?:e|ed|es|ing)|refus(?:e|ed|es|ing)|den(?:y|ied|ies|ial)|not\s+accept(?:ed|able)?|cannot\s+approve)\b/i;

const SYSTEM_PROMPT = `You are an advisory moderation assistant for MyWisata's admin team.
Review the supplied safe evidence summary and the submitted photos. A human administrator makes
the final decision; you never execute or claim to execute approval, rejection, or changes.

Assess missing or weak evidence, obvious spam or test content, policy conflicts, and whether each
supplied photo appears relevant, clear, or has an obvious category conflict. The exact normalized-
name match count is computed separately and must be treated as the authoritative duplicate signal.
Photo analysis must not claim authenticity, location proof, ownership, or publishing rights.
Use only the supplied Photo ID values in photoAssessments. Do not invent IDs.

Respond with ONLY strict JSON matching this shape:
{"suggestedAction":"approve"|"request_changes"|"reject","confidence":"low"|"medium"|"high","findings":[{"field":"vendor_name"|"description"|"why_recommend"|"category"|"location"|"contact"|"photos"|"image_attestation"|"duplicate","severity":"low"|"medium"|"high","kind":"low_quality"|"conflict"|"spam"|"test_content"|"policy"|"duplicate"|"manual_review","message":"...","evidenceSummary":"..."|null}],"feedbackDraft":"..."|null,"photoAssessments":[{"imageId":"supplied Photo ID","status":"appears_relevant"|"possible_conflict"|"unclear"|"could_not_analyse","message":"..."}]}`;

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

export interface RecommendationCategoryRelation {
  name: string | null;
  is_active?: boolean | null;
}

export interface RecommendationEvidenceRow {
  id: string;
  vendor_name: string | null;
  vendor_name_normalized: string | null;
  description: string | null;
  why_recommend: string | null;
  category_id: string | null;
  categories: RecommendationCategoryRelation | RecommendationCategoryRelation[] | null;
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

export interface RecommendationImageRow {
  id: string;
  storage_path: string;
  sort_order: number;
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

function resolvedCategory(row: RecommendationEvidenceRow): RecommendationCategoryRelation | null {
  return Array.isArray(row.categories) ? row.categories[0] ?? null : row.categories;
}

function resolvedCategoryName(row: RecommendationEvidenceRow): string {
  return resolvedCategory(row)?.name?.trim() ?? '';
}

export function buildEvidenceChecks(
  row: RecommendationEvidenceRow,
  imageCount: number,
  duplicateCount: number,
): EvidenceCheck[] {
  const category = resolvedCategory(row);
  const categoryName = category?.name?.trim() ?? '';
  const categoryPasses = Boolean(categoryName) && category?.is_active === true;
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
      status: categoryPasses ? 'passed' : 'missing',
      message: categoryPasses
        ? `Category: ${categoryName}`
        : categoryName
          ? 'Category is inactive or not available.'
          : 'Category is not available.',
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

function isModelDuplicateFinding(finding: ModerationFinding): boolean {
  return finding.field === 'duplicate' || finding.kind === 'duplicate';
}

function buildDuplicateFeedback(duplicateCount: number): string {
  return `This recommendation has ${duplicateCount} exact normalized-name match${duplicateCount === 1 ? '' : 'es'} and requires manual review.`;
}

const FINDING_FIELD_LABELS: Record<RecommendationEvidenceField, string> = {
  vendor_name: 'business name',
  description: 'description',
  why_recommend: 'recommendation reason',
  category: 'category',
  location: 'location',
  contact: 'contact method',
  photos: 'photo evidence',
  image_attestation: 'image rights',
  duplicate: 'duplicate evidence',
};

function buildStructuredBasisLabels(
  checks: EvidenceCheck[],
  findings: ModerationFinding[],
  photoAssessments: PhotoAssessment[],
): string[] {
  const labels = [
    ...checks
      .filter((check) => check.field !== 'duplicate' && check.status !== 'passed')
      .map((check) => check.label.toLowerCase()),
    ...findings.map((finding) => {
      const fieldLabel = FINDING_FIELD_LABELS[finding.field];
      return finding.kind === 'low_quality'
        ? `${fieldLabel} quality`
        : `${fieldLabel} review`;
    }),
    ...photoAssessments
      .filter((photo) => photo.status !== 'appears_relevant')
      .map((photo) => photo.status === 'possible_conflict' ? 'photo conflict' : 'photo analysis'),
  ];

  return [...new Set(labels)].slice(0, 3);
}

function buildDuplicateRequestFeedback(
  duplicateCount: number,
  checks: EvidenceCheck[],
  findings: ModerationFinding[],
  photoAssessments: PhotoAssessment[],
): string {
  const duplicateSummary = `This recommendation has ${duplicateCount} exact normalized-name match${duplicateCount === 1 ? '' : 'es'}.`;
  const basisLabels = buildStructuredBasisLabels(checks, findings, photoAssessments);
  if (basisLabels.length === 0) return buildDuplicateFeedback(duplicateCount);
  return `${duplicateSummary} Please review ${basisLabels.join(', ')} and provide any missing details before approval.`;
}

function rejectBasisDescription(kind: ModerationFinding['kind']): string | null {
  switch (kind) {
    case 'spam':
      return 'spam content';
    case 'test_content':
      return 'clear test content';
    case 'policy':
      return 'a policy conflict';
    default:
      return null;
  }
}

function buildAuthoritativeRejectFeedback(
  findings: ModerationFinding[],
  duplicateCount: number,
): string | null {
  const basis = findings.find((finding) =>
    finding.severity === 'high' && REJECT_KINDS.has(finding.kind));
  const duplicateSummary = duplicateCount > 0
    ? `This recommendation has ${duplicateCount} exact normalized-name match${duplicateCount === 1 ? '' : 'es'}.`
    : null;
  const basisDescription = basis ? rejectBasisDescription(basis.kind) : null;

  if (duplicateSummary && basisDescription) {
    return `${duplicateSummary} It also contains ${basisDescription}. Rejection is required.`;
  }
  if (duplicateSummary) return `${duplicateSummary} Rejection is required.`;
  if (basisDescription) return `This recommendation contains ${basisDescription}. Rejection is required.`;
  return null;
}

export function applyDecisionGuardrails(
  ai: AiModerationResult,
  checks: EvidenceCheck[],
  duplicateCount: number,
): Pick<ModerationAssessment, 'suggestedAction' | 'confidence' | 'feedbackDraft'> {
  const nonDuplicateFindings = ai.findings.filter((finding) => !isModelDuplicateFinding(finding));
  const requiredIssue = checks.some((check) =>
    ['missing', 'invalid', 'low_quality'].includes(check.status));
  const photoConflict = ai.photoAssessments.some((photo) => photo.status === 'possible_conflict');
  const photoNeedsManualReview = ai.photoAssessments.some((photo) =>
    photo.status === 'could_not_analyse' || containsProhibitedPhotoClaim(photo.message, true));
  const unsafeModelProse = ai.findings.some((finding) =>
    containsProhibitedPhotoClaim(finding.message, finding.field === 'photos')
    || (finding.evidenceSummary !== null
      && containsProhibitedPhotoClaim(finding.evidenceSummary, finding.field === 'photos')))
    || (ai.feedbackDraft !== null && containsProhibitedPhotoClaim(ai.feedbackDraft))
    || ai.photoAssessments.some((photo) => containsProhibitedPhotoClaim(photo.message, true));
  const manualPhotoFindingPresent = nonDuplicateFindings.some((finding) =>
    finding.field === 'photos' && finding.kind === 'manual_review');
  const photoFindingConflict = nonDuplicateFindings.some((finding) =>
    finding.field === 'photos' && finding.kind === 'conflict');
  const highFinding = nonDuplicateFindings.some((finding) => finding.severity === 'high');
  const deterministicDuplicateBasis = duplicateCount >= 2;
  const rejectBasis = deterministicDuplicateBasis || nonDuplicateFindings.some((finding) =>
    finding.severity === 'high'
    && REJECT_KINDS.has(finding.kind));
  const nonDuplicateCheckIssue = checks.some((check) =>
    check.field !== 'duplicate' && check.status !== 'passed');
  const photoIssue = ai.photoAssessments.some((photo) => photo.status !== 'appears_relevant');
  const legitimateRequestBasis = nonDuplicateCheckIssue
    || nonDuplicateFindings.length > 0
    || photoIssue
    || photoNeedsManualReview
    || unsafeModelProse;

  let suggestedAction = ai.suggestedAction;
  if (requiredIssue) {
    suggestedAction = 'request_changes';
  }
  if (suggestedAction === 'reject' && !rejectBasis) {
    suggestedAction = 'request_changes';
  }
  if (suggestedAction === 'approve' && (photoConflict || photoFindingConflict || highFinding || duplicateCount > 0)) {
    suggestedAction = 'request_changes';
  }
  if (photoNeedsManualReview || unsafeModelProse || manualPhotoFindingPresent) {
    suggestedAction = 'request_changes';
  }

  if (duplicateCount === 0
    && ai.suggestedAction === 'request_changes'
    && suggestedAction === 'request_changes'
    && !legitimateRequestBasis) {
    suggestedAction = 'approve';
  }

  const actionOverridden = suggestedAction !== ai.suggestedAction;
  const downgradedReject = ai.suggestedAction === 'reject' && suggestedAction !== 'reject';
  const authoritativeRejectFeedback = suggestedAction === 'reject'
    ? buildAuthoritativeRejectFeedback(nonDuplicateFindings, duplicateCount)
    : null;
  const duplicateRequestFeedback = duplicateCount > 0 && suggestedAction === 'request_changes'
    ? buildDuplicateRequestFeedback(duplicateCount, checks, nonDuplicateFindings, ai.photoAssessments)
    : null;

  return {
    suggestedAction,
    confidence: actionOverridden && ai.confidence === 'high' ? 'medium' : ai.confidence,
    feedbackDraft: suggestedAction === 'approve'
      ? null
      : suggestedAction === 'reject'
        ? authoritativeRejectFeedback ?? REJECT_FEEDBACK
        : duplicateRequestFeedback
          ?? normalizeFeedbackDraft(ai.feedbackDraft, suggestedAction, downgradedReject),
  };
}

function normalizeFeedbackDraft(
  draft: string | null,
  action: Exclude<AiModerationResult['suggestedAction'], 'approve'>,
  downgradedReject: boolean,
): string {
  if (downgradedReject) return REQUEST_CHANGES_FEEDBACK;

  const sanitized = draft === null ? '' : sanitizeModelText(draft, []).trim();
  if (containsProhibitedPhotoClaim(sanitized)) {
    return action === 'request_changes' ? MANUAL_PHOTO_FEEDBACK : REJECT_FEEDBACK;
  }
  if (action === 'request_changes' && REJECTION_LANGUAGE.test(sanitized)) {
    return REQUEST_CHANGES_FEEDBACK;
  }

  const bounded = sanitized.slice(0, 500).trim();
  if (bounded.length >= MIN_FEEDBACK_DRAFT_LENGTH) return bounded;
  return action === 'request_changes' ? REQUEST_CHANGES_FEEDBACK : REJECT_FEEDBACK;
}

function extractJson(text: string): unknown {
  const stripped = text.replace(/```json\s*|```/g, '').trim();
  return JSON.parse(stripped);
}

function normalizeImageMime(contentType: string | null): GeminiInlineImage['mimeType'] {
  const mimeType = contentType?.split(';', 1)[0]?.trim().toLowerCase();
  if (mimeType === 'image/jpeg' || mimeType === 'image/png' || mimeType === 'image/webp') {
    return mimeType;
  }
  throw new Error('unsupported_image_type');
}

async function readResponseBytes(response: Response, maxBytes: number): Promise<Buffer> {
  const contentLengthHeader = response.headers.get('content-length');
  const contentLength = contentLengthHeader === null ? null : Number(contentLengthHeader);
  if (contentLength !== null && Number.isFinite(contentLength) && contentLength > maxBytes) {
    throw new Error('image_too_large');
  }
  if (!response.body) throw new Error('image_body_unavailable');

  const reader = response.body.getReader();
  const chunks: Buffer[] = [];
  let totalBytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;
      totalBytes += value.byteLength;
      if (totalBytes > maxBytes) throw new Error('image_too_large');
      chunks.push(Buffer.from(value));
    }
  } catch (error) {
    await reader.cancel().catch(() => undefined);
    throw error;
  } finally {
    reader.releaseLock();
  }
  return Buffer.concat(chunks, totalBytes);
}

export async function loadRecommendationImages(
  service: SupabaseClient,
  rows: RecommendationImageRow[],
): Promise<{ images: GeminiInlineImage[]; failures: string[] }> {
  const supportedRows = rows.slice(0, 5);
  const overflowFailures = rows.slice(5).map((row) => row.id);
  const loaded = await Promise.all(supportedRows.map(async (row) => {
    const controller = new AbortController();
    let timeout: ReturnType<typeof setTimeout> | undefined;
    try {
      const load = (async () => {
        const { data, error } = await service.storage
          .from('recommendation-images')
          .createSignedUrl(row.storage_path, 60, {
            transform: { width: 1024, height: 1024, resize: 'contain' },
          });
        if (error || !data?.signedUrl) throw new Error('signed_image_unavailable');

        const response = await fetch(data.signedUrl, { cache: 'no-store', signal: controller.signal });
        if (!response.ok) throw new Error('image_fetch_failed');
        const mimeType = normalizeImageMime(response.headers.get('content-type'));
        const bytes = await readResponseBytes(response, MAX_RECOMMENDATION_PHOTO_BYTES);

        return { id: row.id, mimeType, data: bytes.toString('base64') };
      })();
      const timeoutFailure = new Promise<never>((_, reject) => {
        timeout = setTimeout(() => {
          controller.abort();
          reject(new Error('image_fetch_timeout'));
        }, RECOMMENDATION_PHOTO_TIMEOUT_MS);
      });
      const image = await Promise.race([load, timeoutFailure]);
      return { image, failure: null };
    } catch {
      return { image: null, failure: row.id };
    } finally {
      if (timeout !== undefined) clearTimeout(timeout);
    }
  }));

  const images: GeminiInlineImage[] = [];
  const failures: string[] = [];
  let totalPayloadBytes = 0;
  for (const item of loaded) {
    if (!item.image) {
      if (item.failure) failures.push(item.failure);
      continue;
    }
    const imagePayloadBytes = Buffer.byteLength(item.image.data, 'ascii');
    if (totalPayloadBytes + imagePayloadBytes > MAX_GEMINI_IMAGE_PAYLOAD_BYTES) {
      failures.push(item.image.id);
      continue;
    }
    images.push(item.image);
    totalPayloadBytes += imagePayloadBytes;
  }
  failures.push(...overflowFailures);

  return {
    images,
    failures,
  };
}

function safeSummaryValue(value: string | null | undefined): string {
  const { clean } = redactPII(value ?? '(not provided)');
  return clean
    .replace(/https?:\/\/\S+/gi, '[URL]')
    .replace(/(?:storage_path|staged|private|recommendation-images)\/\S+/gi, '[PATH]');
}

export function buildSafeSubmissionText(
  rec: RecommendationEvidenceRow,
  imageCount: number,
  duplicateCount: number,
): string {
  const categoryName = resolvedCategoryName(rec);
  const contactKinds = [
    rec.contact_phone?.trim() ? 'phone' : null,
    rec.contact_email?.trim() ? 'email' : null,
    rec.contact_website?.trim() ? 'website' : null,
  ].filter((value): value is string => Boolean(value));

  return [
    `Vendor name: ${safeSummaryValue(rec.vendor_name)}`,
    `Description: ${safeSummaryValue(rec.description)}`,
    `Recommendation reason: ${safeSummaryValue(rec.why_recommend)}`,
    `Category: ${safeSummaryValue(categoryName || null)}`,
    `Google place name: ${safeSummaryValue(rec.location_name)}`,
    `Formatted address: ${safeSummaryValue(rec.formatted_address)}`,
    `Coordinates present: ${Number.isFinite(rec.latitude) && Number.isFinite(rec.longitude) ? 'yes' : 'no'}`,
    `Contact methods present: ${contactKinds.join(', ') || 'none'}`,
    `Photo count: ${imageCount}`,
    `Image rights attested: ${rec.image_attested_at?.trim() ? 'yes' : 'no'}`,
    `Exact normalized-name matches: ${duplicateCount}`,
  ].join('\n');
}

function photoFailureAssessments(failures: string[]): PhotoAssessment[] {
  return failures.map((imageId) => ({
    imageId,
    status: 'could_not_analyse' as const,
    message: 'This photo could not be analysed.',
  }));
}

const PHOTO_REFERENCE = /\b(?:photo|photos|image|images|picture|pictures|uploaded[\s-]+media|(?:submitted|provided)\s+(?:photo|image|picture|media))\b/i;
const PROHIBITED_PHOTO_SUBJECT = /\b(?:authentic(?:ity)?|genuine|real|actual|legitimate|ownership|owner|own(?:s|ed)?|belong(?:s|ed|ing)?|rights?|copyright|permission|authori[sz](?:e|ed|ation)|license(?:d)?|located|location|place|address)\b/i;
const PROHIBITED_PHOTO_ASSERTION = /\b(?:verif(?:y|ied|ies|ication)|prove(?:s|d)?|proof|confirm(?:s|ed|ation)?|establish(?:es|ed|ing)?|demonstrat(?:es|ed|ing)?|show(?:s|n)?|indicat(?:e|es|ed|ing)?|claim(?:s|ed|ing)?|proclaim(?:s|ed|ing)?)\b/i;
const DIRECT_PROHIBITED_PHOTO_ASSERTION = /\b(?:is|are|was|were|looks?|seems?|appears?)\s+(?:to\s+be\s+)?(?:authentic(?:ity)?|genuine|real|actual|legitimate|ownership|owner|rights?|copyright|permission|license(?:d)?|located|location|place|address)\b/i;
const PHOTO_LOCATION_ASSERTION = /\b(?:is|are|was|were|has\s+been|had\s+been)\s+(?:taken|captured|photographed|shot)\b[^.!?]{0,100}\b(?:location|place|address)\b/i;
const BENIGN_PHOTO_RELEVANCE = /\b(?:appear(?:s)?|seem(?:s)?|look(?:s)?)\s+(?:to\s+be\s+)?relevant\b[^.!?]{0,100}\b(?:listed|provided|submitted)\s+(?:place(?:\s*\/\s*location)?|location)\b/gi;
const PROHIBITED_PHOTO_MESSAGE = 'Photo assessment omitted because it made a prohibited claim.';

function containsProhibitedPhotoClaim(text: string, isPhotoContext = false): boolean {
  const normalized = text.replace(/\s+/g, ' ').trim();
  if (!normalized) return false;
  const withoutBenignRelevance = normalized.replace(BENIGN_PHOTO_RELEVANCE, ' ');
  const hasProhibitedSubject = PROHIBITED_PHOTO_SUBJECT.test(withoutBenignRelevance);
  if (!hasProhibitedSubject) return false;
  const hasPhotoContext = isPhotoContext || PHOTO_REFERENCE.test(withoutBenignRelevance);
  const hasAssertion = PROHIBITED_PHOTO_ASSERTION.test(withoutBenignRelevance);
  const hasDirectAssertion = DIRECT_PROHIBITED_PHOTO_ASSERTION.test(withoutBenignRelevance);
  const hasPhotoLocationAssertion = PHOTO_LOCATION_ASSERTION.test(withoutBenignRelevance);
  return hasPhotoContext && (hasAssertion || hasDirectAssertion || hasPhotoLocationAssertion);
}

function manualPhotoFinding(): ModerationFinding {
  return {
    field: 'photos',
    severity: 'medium',
    kind: 'manual_review',
    message: 'Photo review requires manual review.',
    evidenceSummary: null,
  };
}

function sanitizeModelText(value: string, imageData: readonly string[]): string {
  const { clean } = redactPII(value);
  return imageData.reduce((safeText, data) => data ? safeText.split(data).join('[IMAGE_DATA]') : safeText, clean)
    .replace(/https?:\/\/\S+/gi, '[URL]')
    .replace(/(?:storage_path|staged|private|recommendation-images)\/\S+/gi, '[PATH]')
    .replace(/data:image\/[^;]+;base64,[A-Za-z0-9+/=]+/gi, '[IMAGE_DATA]')
    .replace(/\b[A-Za-z0-9+/]{24,}={0,2}\b/g, '[IMAGE_DATA]');
}

function sanitizeAiResult(result: AiModerationResult, images: readonly GeminiInlineImage[]): AiModerationResult {
  const imageData = images.map((image) => image.data);
  let unsafeProse = false;
  const findings = result.findings.flatMap((finding) => {
    const isPhotoFinding = finding.field === 'photos';
    const unsafe = containsProhibitedPhotoClaim(finding.message, isPhotoFinding)
      || (finding.evidenceSummary !== null && containsProhibitedPhotoClaim(finding.evidenceSummary, isPhotoFinding));
    if (unsafe) {
      unsafeProse = true;
      return [];
    }
    return [{
        ...finding,
        message: sanitizeModelText(finding.message, imageData),
        evidenceSummary: finding.evidenceSummary === null
          ? null
          : sanitizeModelText(finding.evidenceSummary, imageData),
      }];
  });
  const unsafeFeedback = result.feedbackDraft !== null
    && containsProhibitedPhotoClaim(result.feedbackDraft);
  if (unsafeFeedback) unsafeProse = true;
  const safeFindings = unsafeProse
    && !findings.some((finding) => finding.field === 'photos' && finding.kind === 'manual_review')
    ? [...findings, manualPhotoFinding()]
    : findings;
  return {
    ...result,
    findings: safeFindings,
    feedbackDraft: unsafeFeedback
      ? MANUAL_PHOTO_FEEDBACK
      : result.feedbackDraft === null
      ? null
      : sanitizeModelText(result.feedbackDraft, imageData),
    photoAssessments: result.photoAssessments.map((photo) => containsProhibitedPhotoClaim(photo.message, true)
      ? { ...photo, status: 'could_not_analyse' as const, message: PROHIBITED_PHOTO_MESSAGE }
      : { ...photo, message: sanitizeModelText(photo.message, imageData) }),
  };
}

function mergePhotoAssessments(
  modelAssessments: PhotoAssessment[],
  images: readonly GeminiInlineImage[],
  failures: string[],
  activeImageIds: string[],
): PhotoAssessment[] {
  const suppliedImageIds = new Set(images.map((image) => image.id));
  const failedImageIds = new Set(failures);
  const assessmentsByImageId = new Map<string, PhotoAssessment>();

  for (const assessment of modelAssessments) {
    if (!suppliedImageIds.has(assessment.imageId) || assessmentsByImageId.has(assessment.imageId)) continue;
    assessmentsByImageId.set(assessment.imageId, assessment);
  }

  return activeImageIds.map((imageId) => failedImageIds.has(imageId) || !assessmentsByImageId.has(imageId)
    ? {
        imageId,
        status: 'could_not_analyse' as const,
        message: 'This photo could not be analysed.',
      }
    : assessmentsByImageId.get(imageId)!);
}

/**
 * Exact duplicate signal — count of OTHER non-rejected recommendations
 * whose normalized name matches this one. Aggregate count only, never the
 * other submitters' identities.
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
    .select(`
      id, vendor_name, vendor_name_normalized, description, why_recommend,
      category_id, google_place_id, location_name, formatted_address,
      latitude, longitude, contact_phone, contact_email, contact_website,
      image_attested_at, state, categories(name,is_active)
    `)
    .eq('id', recommendationId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!rec) throw new Error('recommendation_not_found');

  const recommendation = rec as RecommendationEvidenceRow;
  const { data: imageRows, error: imageError } = await service
    .from('recommendation_images')
    .select('id,storage_path,sort_order')
    .eq('recommendation_id', recommendationId)
    .eq('is_staged', false)
    .is('removed_at', null)
    .order('sort_order', { ascending: true });
  if (imageError) throw new Error(imageError.message);

  const activeImageRows = (imageRows ?? []) as RecommendationImageRow[];
  const duplicateCount = await duplicateSignal(service, recommendationId, recommendation.vendor_name_normalized);
  const { images, failures } = await loadRecommendationImages(service, activeImageRows);
  const evidenceChecks = buildEvidenceChecks(recommendation, activeImageRows.length, duplicateCount).map((check) => {
    if (check.field !== 'photos' || failures.length === 0) return check;
    return {
      ...check,
      status: 'needs_manual_review' as const,
      message: `${check.message} ${failures.length} photo${failures.length === 1 ? '' : 's'} could not be analysed.`,
    };
  });
  const unavailablePhotoAssessments = photoFailureAssessments(activeImageRows.map((row) => row.id));
  const unavailable = (): ModerationAssessment => ({
    suggestedAction: null,
    confidence: null,
    evidenceChecks,
    findings: [],
    duplicateCount,
    duplicateBasis: 'exact_normalized_name',
    feedbackDraft: null,
    photoAssessments: unavailablePhotoAssessments,
    aiAvailable: false,
  });

  try {
    const raw = await callGemini(
      SYSTEM_PROMPT,
      buildSafeSubmissionText(recommendation, activeImageRows.length, duplicateCount),
      { temperature: 0, maxOutputTokens: 1200, images },
    );
    const parsed = aiResultSchema.safeParse(extractJson(raw));
    if (!parsed.success) return unavailable();

    const sanitized = sanitizeAiResult(parsed.data, images);
    const photoAssessments = mergePhotoAssessments(
      sanitized.photoAssessments,
      images,
      failures,
      activeImageRows.map((row) => row.id),
    );
    const guardrails = applyDecisionGuardrails({ ...sanitized, photoAssessments }, evidenceChecks, duplicateCount);
    const findings = sanitized.findings.filter((finding) => !isModelDuplicateFinding(finding));

    return {
      ...guardrails,
      evidenceChecks,
      findings,
      duplicateCount,
      duplicateBasis: 'exact_normalized_name',
      photoAssessments,
      aiAvailable: true,
    };
  } catch {
    return unavailable();
  }
}
