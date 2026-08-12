# Recommendation AI Review Improvement Design

**Date:** 2026-08-07
**Status:** Approved design
**Scope:** Super Admin recommendation moderation assistant

## Context

The current Recommendation AI Review provides a short free-text completeness note, duplicate likelihood, quality note, and generic risk flag. It can identify obvious test names or meaningless descriptions, but it does not receive the same evidence shown on the recommendation detail page and therefore cannot reliably support a moderation decision.

The current implementation reads only the vendor name, normalized name, legacy vendor address, description, legacy state, and category ID. It does not inspect the recommendation reason, category name, Google place evidence, contact-method presence, image attestation, or submitted photos. Its duplicate query is an exact normalized-name comparison even though the prompt describes it as fuzzy matching. The UI does not identify affected fields or provide an actionable next step.

The improved experience must remain advisory. A human administrator is the only actor allowed to submit Approve, Request changes, or Reject.

## Product Decisions

- Use a decision-first review card.
- AI may suggest `approve`, `request_changes`, or `reject`, but may never execute an action.
- AI may analyse every submitted photo for visible relevance, clarity, and obvious category conflict.
- Photo analysis must not claim to prove location, authenticity, ownership, or publishing rights.
- When AI suggests Request changes or Reject, it generates an editable feedback draft.
- “Use this reason” selects the suggested action and fills the existing reason input, but does not open the confirmation dialog or submit the review.
- AI may suggest Reject only for clear test content, spam, policy-invalid content, or a high duplicate signal. Missing or weak evidence defaults to Request changes.
- The legacy `state` column is not a submission requirement and must not be reported as missing. Location completeness is based on Google place name, formatted address, latitude, and longitude.
- Exact normalized-name matching remains the only duplicate mechanism in this scope. The UI must show the count and basis rather than calling it fuzzy matching.
- AI results are not persisted. Administrators rerun the analysis when needed.

## Architecture

The review is split into deterministic evidence checks and AI analysis.

### Deterministic evidence checks

The server checks facts that do not require a language model:

- vendor name is present;
- description is present and satisfies the submission length contract;
- recommendation reason is present and satisfies the submission length contract;
- category relation resolves to an active category name;
- Google location name, formatted address, latitude, and longitude are present;
- at least one private contact method exists, without exposing its value to Gemini;
- one to five active recommendation images exist;
- image rights were attested;
- exact normalized-name duplicate count.

Each check returns a structured result:

```ts
type EvidenceCheckStatus =
  | 'passed'
  | 'missing'
  | 'invalid'
  | 'low_quality'
  | 'needs_manual_review';

interface EvidenceCheck {
  field: RecommendationEvidenceField;
  label: string;
  status: EvidenceCheckStatus;
  message: string;
}
```

These checks remain available when Gemini is unavailable or returns malformed output.

### AI analysis

Gemini receives a safe evidence summary containing:

- vendor name;
- description;
- recommendation reason;
- category name;
- Google place name and formatted address;
- whether coordinates are present;
- number and kinds of contact methods present, never their values;
- image count;
- image-attestation state;
- exact normalized-name match count and explicit comparison basis;
- transformed versions of all active submitted photos.

Gemini must not receive:

- submitter or reviewer identity;
- raw phone number, email address, or website;
- storage object paths;
- signed storage URLs as textual prompt content;
- unrelated recommendation rows or submitter identities.

The server obtains active image rows only after Super Admin authorization. It creates short-lived transformed image URLs, fetches the reduced images server-side, and sends their bytes as Gemini inline image parts. Images are not written to a new local or database store.

One unreadable image does not fail the whole review. Its deterministic check becomes `needs_manual_review`, while other images and text continue through analysis.

## AI Result Contract

```ts
type SuggestedAction = 'approve' | 'request_changes' | 'reject';
type AssessmentConfidence = 'low' | 'medium' | 'high';

interface ModerationFinding {
  field: RecommendationEvidenceField;
  severity: 'low' | 'medium' | 'high';
  kind: 'low_quality' | 'conflict' | 'spam' | 'test_content' | 'policy' | 'duplicate' | 'manual_review';
  message: string;
  evidenceSummary: string | null;
}

interface PhotoAssessment {
  imageId: string;
  status: 'appears_relevant' | 'possible_conflict' | 'unclear' | 'could_not_analyse';
  message: string;
}

interface ModerationAssessment {
  suggestedAction: SuggestedAction | null;
  confidence: AssessmentConfidence | null;
  evidenceChecks: EvidenceCheck[];
  findings: ModerationFinding[];
  duplicateCount: number;
  duplicateBasis: 'exact_normalized_name';
  feedbackDraft: string | null;
  photoAssessments: PhotoAssessment[];
  aiAvailable: boolean;
}
```

The API validates Gemini output with a strict Zod schema. It combines valid model findings with deterministic checks instead of allowing the model to redefine factual field presence.

## Server-Side Decision Guardrails

The model recommendation is constrained after parsing:

- `approve` is allowed as a suggestion only when all required deterministic checks pass and there are no high-severity findings or photo conflicts.
- Missing or weak evidence forces `request_changes`.
- A model-suggested `reject` is accepted only when at least one high-severity finding is classified as test content, spam, policy violation, or duplicate.
- A `reject` suggestion without an allowed reject basis is downgraded to `request_changes`.
- Gemini failure or malformed output produces deterministic checks with `aiAvailable: false`; it does not fabricate a suggested action or feedback draft.
- No code in the analysis service calls the recommendation review RPC or writes recommendation status.

## User Interface

The selected layout is **Decision first**.

### Suggested decision

The card begins with:

- suggested action;
- confidence;
- issue count;
- “Advisory only — administrator confirmation required.”

### Needs attention

Each finding identifies the affected field, issue type, and concise explanation. Selecting a finding scrolls the recommendation detail page to the corresponding evidence section.

Missing data and low-quality content are never merged into one free-text completeness sentence.

### Passed checks

The card derives the Passed checks section from `evidenceChecks` and lists relevant successful checks, including location completeness, contact-method presence, image attestation, image count, and category resolution.

### Duplicate evidence

The card displays a verifiable statement such as:

> 0 exact normalized-name matches

It does not expose other submitters and does not label the existing comparison as fuzzy.

### Suggested feedback

For Request changes or Reject, the card displays the full generated draft before the administrator uses it.

“Use this reason” calls a callback owned by the recommendation detail view. The callback:

1. selects `request_changes` or `reject`;
2. fills the existing reason state;
3. scrolls to the reason input.

It does not open the confirmation dialog and does not submit the action. The administrator may edit the text and must still click Continue and confirm.

### Error and degraded states

- Gemini unavailable: deterministic checks remain visible with “AI analysis unavailable.”
- Malformed Gemini JSON: treated as unavailable; no partial model verdict is shown.
- Individual photo failure: that photo displays “Could not analyse”; remaining evidence is still assessed.
- No result is restored after page refresh, preventing stale conclusions.

## Security and Privacy

- The API remains restricted to Super Admin.
- Service-role access is created only after cookie-derived authentication and Super Admin authorization.
- Service-role queries use explicit column projections.
- Raw private contact values never enter the Gemini payload.
- Storage paths and signed URLs never appear in the AI response or textual prompt.
- Reduced recommendation photos are sent to Gemini only after a Super Admin explicitly starts AI Review.
- AI review remains read-only and cannot alter recommendation, image, user, notification, or audit records.
- Development logs must not log image bytes, raw private contacts, storage paths, or signed URLs.

## Files in Scope

- Modify `lib/admin-ai/moderation.ts`
- Modify `lib/admin-ai/gemini.ts`
- Modify `app/api/admin-ai/moderation-review/route.ts`
- Modify `components/admin/recommendation-ai-review-panel.tsx`
- Modify `components/admin/recommendation-detail-view.tsx`
- Add focused tests for the moderation service, API authorization/privacy contract, Gemini multimodal payload, UI contract, and action-draft callback

## Out of Scope

- automatic or batch moderation;
- background or scheduled AI review;
- Google Business verification;
- fuzzy duplicate search;
- AI result persistence or model-review history;
- prompt-management administration;
- database schema changes or migrations;
- claims that photos prove location, authenticity, ownership, or rights;
- sending other submitters' identities or full historical recommendations to Gemini;
- automatic email or notification triggered by AI analysis.

## Verification

Automated coverage must prove:

- missing evidence and low-quality text are separate findings;
- legacy `state` is not treated as required;
- Google place name, address, and coordinates determine location completeness;
- recommendation reason, category, location status, contact presence, image count, and attestation are included in the safe summary;
- raw contacts and storage paths do not enter Gemini requests;
- every active photo is included after transformation;
- one photo failure does not fail all analysis;
- zero, one, and multiple exact normalized-name matches are reported with the correct basis;
- approval, request-changes, rejection, and rejection-downgrade guardrails;
- malformed model JSON and model unavailability preserve deterministic checks;
- unauthenticated and non-Super-Admin requests return 401 and 403;
- “Use this reason” fills local action and reason state without calling the review endpoint.

Manual browser verification must cover:

- a high-quality Pending recommendation;
- a recommendation with low-quality or test content;
- a recommendation with multiple photos;
- AI unavailable state;
- field navigation from a finding;
- filling and editing a suggested reason;
- confirmation remains a separate administrator action.

## Success Criteria

An administrator can understand the suggested next step, verify every factual basis, identify the exact problematic evidence, and reuse an editable reason without the AI taking any moderation action. The assistant no longer reports legacy `state` as missing, no longer labels exact matching as fuzzy, and remains useful when Gemini is temporarily unavailable.
