# Recommendation Invite Prefill Design

**Status:** awaiting written-spec review — implementation not started

## Context

An approved customer recommendation already contains much of the information requested by the vendor invitation claim form. The current `/vendor/register?recommendation=...` experience presents an empty form, forces invited vendors to repeat known information, and sits under the authenticated Vendor portal layout. An unauthenticated invite recipient is therefore redirected before reaching the claim experience.

This change makes the invitation a token-protected public entry point, shows the recommendation evidence that prompted the invitation, and pre-fills the existing fixed Vendor application form. The Vendor remains responsible for reviewing and correcting every value before creating a private Vendor Draft.

## Decisions

- Use a token preview API that reads the current approved recommendation; do not duplicate recommendation data into an invitation snapshot.
- Send new invitation links to the top-level public route `/vendor-invite?recommendation=<token>`. Do not weaken or restructure the authenticated `/vendor` portal layout.
- Keep the existing Vendor claim form fields fixed. Do not add description, recommendation reason, or photo inputs.
- Show a separate Recommendation details summary above the form.
- Do not reveal the recommender's name, email, or other identity information. Use the copy: `A MyWisata member recommended this business.`
- Display: `Pre-filled from a customer recommendation. Please review and edit any details that are incorrect.`
- Allow an unauthenticated recipient to open the invitation page, view safe evidence, and edit safe pre-filled fields.
- Before authentication, mask private recommendation contact details. Reveal and pre-fill complete contact values only after the signed-in account email matches the invitation email.
- Preserve the token and edited form values across sign-in or account creation using session storage.
- Keep phone verification as a mandatory claim gate.
- Vendor edits create the Vendor Draft and do not modify the original recommendation evidence.
- Recommendation photos remain reference evidence and are not copied into the Vendor profile.

## Page experience

### Recommendation details

The public token page displays only evidence safe for the invitation recipient:

- Business name
- Description
- Why the place was recommended
- Recommendation category
- Google location name and formatted address
- Recommendation photos through time-limited signed URLs
- The generic recommender attribution copy

It never displays the recommender's identity. Contact email and phone are masked until the invitation email has been matched to an authenticated account.

### Fixed Vendor form

The form retains exactly these fields:

- Business name
- Legal business name
- Business type
- Contact email
- Contact phone
- Business address

Defaults are mapped as follows:

| Vendor field | Recommendation source |
| --- | --- |
| Business name | Vendor/business name |
| Legal business name | Vendor/business name |
| Business type | Recommendation category |
| Contact email | Recommendation contact email, unlocked after email match |
| Contact phone | Recommendation contact phone, unlocked after email match |
| Business address | Google formatted address, falling back to the stored vendor address |

All six fields remain editable. Missing required values remain empty and must be supplied by the Vendor before submission.

### Authentication transition

An unauthenticated recipient can view the safe summary and edit the safe form fields. Submission starts sign-in or account creation while preserving:

- the raw invite token in the current browser session only;
- the current editable form values;
- the return path to the same invitation page.

After authentication, the page verifies that the account email matches the invitation email. On success it unlocks full contact values, merges them only into fields the Vendor has not already edited, and allows claim submission after phone verification. Successful submission clears the saved browser draft.

## Architecture and data flow

1. The browser opens `/vendor-invite?recommendation=<token>`, a top-level route outside the authenticated Vendor portal layout.
2. A preview endpoint hashes the token and resolves an active invitation and its approved or invited recommendation.
3. For an unauthenticated request, the endpoint returns a safe preview DTO with masked contact values and signed recommendation image URLs. It never returns recommender identity fields or raw storage paths.
4. For an authenticated request whose account email matches the invitation email, the endpoint returns the full prefill DTO.
5. The page initializes the fixed form from the DTO and preserves subsequent Vendor edits in session storage.
6. The existing claim endpoint validates authentication, email match, phone verification, token state, and the edited fixed form.
7. The database RPC atomically creates the pending Vendor and Vendor onboarding Draft, records the claim, and advances the recommendation lifecycle.

The preview operation is read-only. The claim operation remains the sole write boundary.

## Route and component boundaries

- Public invite route: `/vendor-invite` renders the token preview and claim experience without the Vendor sidebar, header, access gate, or server-side Vendor login redirect.
- Preview API: own token resolution, safe/full DTO selection, contact masking, status validation, and signed image issuance.
- Vendor claim form: own editable state, session-storage recovery, sign-in transition, form validation, and submit feedback.
- Claim API and RPC: retain authoritative authentication, phone verification, email binding, one-time token, and atomic Vendor Draft creation.
- All existing `/vendor/*` portal routes remain authenticated and unchanged.
- The legacy `/vendor/register` route remains protected and is no longer generated in new invitation emails. Existing legacy invitations require an Admin to issue a replacement invite using the new public URL.

## Security and privacy

- Store and query only the invitation token hash in the database; never persist or log the raw token.
- Accept previews only for non-expired, non-cancelled invitations in the `invited` state whose recommendation is `approved` or `invited`.
- Treat the token as sufficient only for safe recommendation evidence, not for private contact details or claim authorization.
- Require an authenticated email match before returning full contact values.
- Do not return recommender identity, private user profile fields, raw recommendation image storage paths, internal IDs not needed by the client, or Admin review notes.
- Issue bounded, time-limited signed image URLs.
- Do not trust preview state when claiming. Re-check every token, invitation, recommendation, email, ownership, and verification condition at the write boundary.
- Clear session-storage draft data after successful claim and do not sync it across devices.

## Error handling

The page provides stable, user-facing states:

- Invalid token: `This invitation link is invalid.`
- Expired token: `This vendor invitation has expired. Request a new invitation from MyWisata.`
- Cancelled token: `This vendor invitation was cancelled.`
- Already claimed: `This vendor invitation has already been claimed.`
- Email mismatch: `Sign in with the email address that received this invitation.`
- Phone verification required: direct the user to verification and preserve the invitation return path.
- Preview timeout or network failure: `We couldn't load this invitation. Please retry or request a new invitation.`

The page must replace indefinite loading with a retryable error state after the request timeout. API responses expose stable application codes and generic messages, not Supabase or SQL errors.

## Scope boundaries

In scope:

- Public token invitation preview
- Safe/full prefill DTOs
- Recommendation evidence summary
- Fixed-form prefill and editing
- Authentication return flow and session draft restoration
- Contact privacy and email-match unlock
- New top-level `/vendor-invite` route and updated invitation-email URL generation
- Focused route, component, privacy, and claim tests

Out of scope:

- Adding fields to the fixed Vendor claim form
- Copying recommendation photos into Vendor media
- Publishing recommendation text as Vendor profile content
- Changing Admin recommendation review, recommendation rewards, or conversion rewards
- Redesigning the Vendor portal
- Changing any `/vendor/*` authentication rules or moving Vendor portal folders
- Production deployment or replacing `localhost` with a hosted domain

## Verification

Automated tests must prove:

- A valid token returns the safe recommendation summary before login.
- Unauthenticated output masks email and phone and excludes recommender identity and raw storage paths.
- An authenticated matching email receives complete prefill values.
- A mismatched email cannot access private contact values or submit the claim.
- Business name maps to both Business name and Legal business name by default.
- Recommendation category maps to Business type.
- Google formatted address maps to Business address.
- Every pre-filled form field remains editable.
- Sign-in and account creation preserve the token and edited form values.
- Returning to the invitation restores the browser draft without overwriting Vendor edits.
- Expired, cancelled, already-claimed, invalid, and network-timeout states show the agreed messages.
- Claim submission still requires authentication, invitation email match, and phone verification.
- A successful claim creates only the private Vendor Draft lifecycle records and does not modify recommendation evidence.
- Other Vendor portal pages remain protected.
- Newly generated invitation emails use `/vendor-invite`, never `/vendor/register`.

Manual verification should cover opening the email link in a signed-out browser, creating or signing into the matching account, returning to the pre-filled form, editing each field, completing phone verification, and submitting the Vendor Draft.
