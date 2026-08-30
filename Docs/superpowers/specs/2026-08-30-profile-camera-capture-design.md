# Profile Camera Capture Design

**Status:** Approved

## Context

The Profile photo step currently accepts JPEG, PNG, and WebP files up to 2 MB,
uploads them through the existing signed Supabase Storage flow, validates the
stored bytes on the server, and then confirms the avatar. The same upload flow
is also available from the completed Profile editor.

Users must also be able to take a profile photo directly. The approved scope is
full browser support: mobile users can use the phone camera and desktop users
can use a connected webcam.

## Decisions

### Two explicit acquisition paths

Both Profile photo entry points display separate `Upload photo` and `Take
photo` actions. Upload keeps the existing file picker. Take photo opens an
in-page camera dialog instead of relying only on the file input `capture`
attribute, because the latter does not provide a complete desktop webcam
experience.

### Shared camera and picker components

A shared Profile photo picker is used by both:

- the four-step Profile completion wizard;
- the completed Profile editor when changing an avatar.

The picker owns the two acquisition actions and delegates live camera handling
to a focused dialog component. The parent pages retain their existing upload
and profile-refresh responsibilities.

### Camera interaction

- Camera access starts only after the user selects `Take photo`.
- The default facing mode is `user` for a profile selfie.
- A switch-camera action toggles between front and rear cameras where the
  browser/device supports it.
- The dialog shows a live, mirrored preview for the front camera.
- After capture, users can `Retake` or `Use photo`.
- `Use photo` creates a square JPEG `File` in the browser and passes it through
  the same preview, upload, server byte-validation, and avatar-confirmation flow
  as an uploaded file.
- Closing the dialog, accepting a photo, switching cameras, or unmounting the
  component stops every active `MediaStreamTrack` immediately.

### Capture output

The camera frame is center-cropped to a 720 x 720 square and encoded as JPEG at
0.9 quality. The selected/captured file must continue to satisfy the existing
allowed MIME types and 2 MB maximum. The server remains authoritative and
continues validating the stored bytes before updating `avatar_url`.

### Errors and fallback

The UI distinguishes:

- browser or insecure-context camera unavailability;
- permission denial;
- no usable camera;
- camera startup failure;
- photo capture failure.

Every failure leaves `Upload photo` available. Camera errors do not alter the
current avatar or upload any bytes.

### Privacy and accessibility

- No camera permission is requested on page load.
- No video is recorded or sent to the server.
- Only the still image accepted through `Use photo` becomes an upload candidate.
- The dialog includes a title, description, visible status/error text, labelled
  controls, and an inline video element with `autoPlay`, `muted`, and
  `playsInline`.
- The camera feature requires a secure browser context; localhost remains valid
  for development.

## Existing implementation reused

- `PUT /api/profile/avatar` signed upload URL issuance.
- Direct upload to the existing `avatars` bucket.
- `POST /api/profile/avatar/confirm` ownership and byte validation.
- `lib/profile/avatar-validation.ts` MIME/signature and 2 MB rules.
- Existing avatar preview, success feedback, profile refresh, and Profile
  completion rules.
- Existing Radix-based dialog and Button design primitives.

## Scope boundaries

This work does not change Profile completion requirements, Phone verification,
KYC, Recommendations, Affiliate, Checkout, Admin pages, public-profile exposure,
Storage policies, avatar bucket visibility, or database migrations. It does not
add image editing, filters, liveness detection, biometric matching, or video
recording.

## Dependencies and database changes

No dependency and no database change is required. The implementation uses the
browser `navigator.mediaDevices.getUserMedia`, `MediaStream`, `<video>`, and
`<canvas>` APIs already available to the application.

## Verification

- Pure tests cover crop geometry, camera-error classification, track cleanup,
  and JPEG `File` creation.
- Component contract tests prove the wizard and completed Profile editor reuse
  the shared picker and retain the original avatar endpoints.
- i18n verification covers English, Bahasa Melayu, and Simplified Chinese copy.
- TypeScript, lint, affected Vitest suites, and a manual secure-context camera
  smoke test verify the finished flow.
