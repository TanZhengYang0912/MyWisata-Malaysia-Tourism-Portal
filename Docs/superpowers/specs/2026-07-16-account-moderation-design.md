# Account-management reason moderation design

## Goal

Use the same Gemini moderation policy as profile bios for account-management text, so harmful or abusive content cannot be used as a suspension reason, deletion reason, unsuspension reason, or account-suspension appeal.

## Scope

The following four text inputs are moderated:

1. Super Admin `suspend` reason.
2. Super Admin `soft_delete` reason.
3. Super Admin `unsuspend` reason.
4. A suspended user's account-review appeal message.

`clear_bio_restriction` and `restore` remain unchanged unless they already carry a reason through the existing user-management contract. No new self-service unsuspend permission is introduced; the user submits an appeal and Support/Admin decides the outcome.

All four inputs must contain at least 10 trimmed characters. The existing server-side schema and database validation remain the minimum-length backstops.

## Recommended architecture

### Server boundary

Moderation runs in the Next.js server layer before any state-changing RPC. A clean result proceeds to the existing database mutation, audit, notification, and email-outbox flow. A flagged or unavailable result stops the request before any side effect.

The management mutation RPC will no longer be directly executable by ordinary authenticated clients. The API will invoke it through the server-only Supabase service client while passing the authenticated actor ID; the database function will still verify that the actor is a Super Admin and that the target/action are valid. Read-only user-management RPCs remain protected by their existing Super Admin checks.

This prevents a client from bypassing Gemini by calling the mutation RPC directly.

### Moderation module

Extend `lib/moderation.ts` with a reusable account-text moderation function. It will share the Bio policy categories (hate speech, explicit content, spam, harassment, illegal activity) and accept a context label so Gemini receives the correct semantic prompt for an admin reason versus a user appeal.

The model ID will be configurable through `GEMINI_MODEL`, with the current Gemini 3.1 Flash Lite model as the default. The API key remains server-only (`GOOGLE_AI_KEY`). Timeouts, non-2xx responses, malformed JSON, and quota errors map to `api_unavailable`.

### Request behavior

- Clean text: continue with the requested operation.
- Flagged text: return HTTP 422 with a user-readable moderation message; do not mutate state or enqueue email.
- Gemini unavailable/timeout/quota/malformed response: return HTTP 503; do not mutate state or enqueue email.
- Too short or otherwise invalid input: return HTTP 422 before calling Gemini.

The appeal route will use the same moderation helper and fail-closed behavior, while preserving the existing support-ticket creation and ticket notification flow after approval.

## Data and audit behavior

No raw identity-document data or Gemini request payload is stored. Existing account-management audit records retain the approved admin reason as they do today. Rejected moderation attempts are logged server-side only with the action/context and moderation outcome, not a copy of the user's text.

## Testing

Add unit and route-contract coverage for:

- clean admin reasons executing normally;
- clean user appeals creating a ticket;
- fewer than 10 characters being rejected;
- flagged admin reason being rejected without RPC/email/audit side effects;
- flagged appeal being rejected without ticket creation;
- Gemini timeout, quota, non-2xx, or malformed output returning 503;
- direct authenticated invocation of the management mutation RPC being denied after the grant is removed;
- Super Admin actor validation still working through the server-only mutation path.

Existing full test, build, lint, and diff checks remain required before completion.

## Explicit non-goals

- No change to the KYC review workflow.
- No change to ordinary Support tickets that are not suspension appeals.
- No self-service Unsuspend button for suspended users.
- No hard deletion of user accounts.
