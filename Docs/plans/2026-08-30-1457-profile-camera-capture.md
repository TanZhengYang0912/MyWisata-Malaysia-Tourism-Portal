# Profile Camera Capture Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let users upload or directly take a Profile photo from mobile and desktop browsers while preserving the existing authoritative avatar upload flow.

**Architecture:** Add a browser-camera utility, a focused camera dialog, and one shared Profile photo picker used by both the incomplete wizard and completed Profile editor. Captured frames become ordinary JPEG `File` objects and continue through the existing signed Storage upload and server confirmation endpoints.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, browser Media Capture APIs, Radix Dialog, TailwindCSS, Vitest, Supabase Storage.

## Global Constraints

- Keep `PUT /api/profile/avatar` and `POST /api/profile/avatar/confirm` authoritative.
- Keep JPEG, PNG, and WebP as the only accepted formats and keep the 2 MB maximum.
- Request camera permission only after a user action and stop every camera track on close, accept, switch, and unmount.
- Support mobile front/rear cameras and desktop webcams; default to the `user` facing mode.
- Keep upload available when camera access is denied or unavailable.
- Use the existing design tokens and translated customer namespace; do not add hardcoded UI copy.
- Do not add dependencies, database migrations, Storage buckets, policies, video recording, liveness checks, biometric matching, filters, or cropping UI.

## File map

- Create `lib/profile/camera-capture.ts`: browser-neutral camera error, crop, cleanup, and JPEG-file helpers.
- Create `lib/profile/__tests__/camera-capture.test.ts`: pure behavior tests for the helpers.
- Create `components/profile/profile-camera-dialog.tsx`: permission, live preview, switch, capture, retake, accept, and lifecycle cleanup.
- Create `components/profile/profile-photo-picker.tsx`: shared upload/take actions, file validation, preview surface, and dialog integration.
- Create `components/profile/__tests__/profile-photo-picker.test.ts`: shared picker and camera safety contracts.
- Modify `lib/profile/avatar-validation.ts`: export the existing MIME allow-list and add client-file metadata validation without weakening server byte checks.
- Modify `lib/profile/__tests__/avatar-validation.test.ts`: cover shared client metadata validation.
- Modify `app/customer/profile/page.tsx`: replace only the Photo-step file input/surface with the shared picker; keep `submitAvatar` unchanged.
- Modify `components/profile/profile-sections.tsx`: replace only the completed-profile avatar input with the shared picker; keep `uploadAvatar` unchanged.
- Modify `app/customer/profile/__tests__/profile-completion.test.ts`: prove both Profile entry points reuse the shared picker and original endpoints.
- Modify `app/i18n/locales/en/customer.json`, `app/i18n/locales/ms/customer.json`, and `app/i18n/locales/zh-CN/customer.json`: add camera and upload labels/errors.

## Scope boundaries

**Files not touched:** `app/api/profile/avatar/route.ts`, `app/api/profile/avatar/confirm/route.ts`, Supabase migrations and policies, KYC routes/components, Phone verification, Profile identity/bio/preferences logic, Recommendation, Affiliate, Checkout, Admin, vendor modules, and public-profile data contracts.

**New dependencies:** None.

**Database changes:** None.

**Risks:** Camera APIs require HTTPS or localhost; permissions can be denied or revoked; a device may expose only one camera; streams can retain the privacy indicator if tracks are not stopped; canvas capture can fail or produce an oversized file. The component must fail safely to upload-only behavior, clean up tracks on every exit, and run captured files through both client metadata validation and existing server byte validation.

---

### Task 1: Camera capture primitives and shared avatar metadata validation

**Files:**
- Create: `lib/profile/camera-capture.ts`
- Create: `lib/profile/__tests__/camera-capture.test.ts`
- Modify: `lib/profile/avatar-validation.ts`
- Modify: `lib/profile/__tests__/avatar-validation.test.ts`

**Interfaces:**
- Produces `type CameraFacingMode = "user" | "environment"`.
- Produces `type CameraErrorCode = "unsupported" | "permission_denied" | "not_found" | "startup_failed" | "capture_failed"`.
- Produces `classifyCameraError(error: unknown): CameraErrorCode`.
- Produces `getSquareCrop(width: number, height: number): { sx: number; sy: number; size: number }`.
- Produces `stopCameraStream(stream: MediaStream | null): void`.
- Produces `createCapturedPhotoFile(blob: Blob, now?: number): File`.
- Produces `AVATAR_ALLOWED_TYPES` and `validateAvatarFileMetadata(file: Pick<File, "type" | "size">): { ok: true } | { ok: false; reason: "type" | "size" }`.

- [ ] **Step 1: Write failing camera helper tests**

```ts
import { describe, expect, it, vi } from "vitest";
import {
  classifyCameraError,
  createCapturedPhotoFile,
  getSquareCrop,
  stopCameraStream,
} from "@/lib/profile/camera-capture";

describe("profile camera capture", () => {
  it("center-crops landscape and portrait frames", () => {
    expect(getSquareCrop(1920, 1080)).toEqual({ sx: 420, sy: 0, size: 1080 });
    expect(getSquareCrop(1080, 1920)).toEqual({ sx: 0, sy: 420, size: 1080 });
  });

  it("classifies browser camera failures without exposing exception text", () => {
    expect(classifyCameraError(new DOMException("blocked", "NotAllowedError"))).toBe("permission_denied");
    expect(classifyCameraError(new DOMException("missing", "NotFoundError"))).toBe("not_found");
    expect(classifyCameraError(new Error("private device detail"))).toBe("startup_failed");
  });

  it("stops every active stream track", () => {
    const first = { stop: vi.fn() };
    const second = { stop: vi.fn() };
    stopCameraStream({ getTracks: () => [first, second] } as unknown as MediaStream);
    expect(first.stop).toHaveBeenCalledOnce();
    expect(second.stop).toHaveBeenCalledOnce();
  });

  it("creates a deterministic JPEG file for the existing upload flow", () => {
    const file = createCapturedPhotoFile(new Blob(["jpeg"], { type: "image/jpeg" }), 1234);
    expect(file.name).toBe("profile-photo-1234.jpg");
    expect(file.type).toBe("image/jpeg");
    expect(file.lastModified).toBe(1234);
  });
});
```

- [ ] **Step 2: Extend the avatar validation tests before implementation**

```ts
import {
  AVATAR_MAX_BYTES,
  validateAvatarBytes,
  validateAvatarFileMetadata,
} from "@/lib/profile/avatar-validation";

expect(validateAvatarFileMetadata({ type: "image/jpeg", size: AVATAR_MAX_BYTES })).toEqual({ ok: true });
expect(validateAvatarFileMetadata({ type: "text/plain", size: 10 })).toEqual({ ok: false, reason: "type" });
expect(validateAvatarFileMetadata({ type: "image/png", size: AVATAR_MAX_BYTES + 1 })).toEqual({ ok: false, reason: "size" });
```

- [ ] **Step 3: Run the focused tests and verify the new interfaces fail**

Run:

```bash
npm test -- lib/profile/__tests__/camera-capture.test.ts lib/profile/__tests__/avatar-validation.test.ts
```

Expected: FAIL because `camera-capture.ts`, `AVATAR_ALLOWED_TYPES`, and `validateAvatarFileMetadata` do not exist.

- [ ] **Step 4: Implement the pure helpers**

```ts
// lib/profile/camera-capture.ts
export type CameraFacingMode = "user" | "environment";
export type CameraErrorCode = "unsupported" | "permission_denied" | "not_found" | "startup_failed" | "capture_failed";

export function classifyCameraError(error: unknown): CameraErrorCode {
  if (error instanceof DOMException && ["NotAllowedError", "SecurityError"].includes(error.name)) return "permission_denied";
  if (error instanceof DOMException && ["NotFoundError", "OverconstrainedError"].includes(error.name)) return "not_found";
  return "startup_failed";
}

export function getSquareCrop(width: number, height: number) {
  const size = Math.min(width, height);
  return { sx: Math.floor((width - size) / 2), sy: Math.floor((height - size) / 2), size };
}

export function stopCameraStream(stream: MediaStream | null) {
  stream?.getTracks().forEach((track) => track.stop());
}

export function createCapturedPhotoFile(blob: Blob, now = Date.now()) {
  return new File([blob], `profile-photo-${now}.jpg`, { type: "image/jpeg", lastModified: now });
}
```

```ts
// additions to lib/profile/avatar-validation.ts
export const AVATAR_ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;

export function validateAvatarFileMetadata(file: Pick<File, "type" | "size">):
  | { ok: true }
  | { ok: false; reason: "type" | "size" } {
  if (!AVATAR_ALLOWED_TYPES.includes(file.type as (typeof AVATAR_ALLOWED_TYPES)[number])) {
    return { ok: false, reason: "type" };
  }
  if (file.size > AVATAR_MAX_BYTES) return { ok: false, reason: "size" };
  return { ok: true };
}
```

Keep `validateAvatarBytes` unchanged except for consuming the exported allow-list where that removes duplication. Do not replace signature validation with metadata validation.

- [ ] **Step 5: Run the focused tests**

Run:

```bash
npm test -- lib/profile/__tests__/camera-capture.test.ts lib/profile/__tests__/avatar-validation.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit the primitive layer**

```bash
git add lib/profile/camera-capture.ts lib/profile/avatar-validation.ts lib/profile/__tests__/camera-capture.test.ts lib/profile/__tests__/avatar-validation.test.ts
git commit -m "feat: add profile camera capture primitives"
```

---

### Task 2: Camera dialog and shared Profile photo picker

**Files:**
- Create: `components/profile/profile-camera-dialog.tsx`
- Create: `components/profile/profile-photo-picker.tsx`
- Create: `components/profile/__tests__/profile-photo-picker.test.ts`

**Interfaces:**
- Consumes every Task 1 interface.
- Produces `ProfileCameraDialog({ open, onOpenChange, onPhotoCaptured })` where `onPhotoCaptured(file: File): void`.
- Produces `ProfilePhotoPicker({ previewUrl, error, disabled, variant, onPhotoSelected, onError })` where `variant` is `"wizard" | "compact"` and `onError(message: string | null): void`.

- [ ] **Step 1: Write a failing component contract test**

```ts
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("shared Profile photo acquisition", () => {
  const dialog = readFileSync(resolve(process.cwd(), "components/profile/profile-camera-dialog.tsx"), "utf8");
  const picker = readFileSync(resolve(process.cwd(), "components/profile/profile-photo-picker.tsx"), "utf8");

  it("starts camera only from the dialog and cleans up every exit", () => {
    expect(dialog).toContain("navigator.mediaDevices.getUserMedia");
    expect(dialog).toContain("stopCameraStream");
    expect(dialog).toContain("playsInline");
    expect(dialog).toContain('facingMode: { ideal: facingMode }');
    expect(dialog).not.toContain("MediaRecorder");
  });

  it("offers separate upload and camera actions through one validated file callback", () => {
    expect(picker).toContain('type="file"');
    expect(picker).toContain("ProfileCameraDialog");
    expect(picker).toContain("validateAvatarFileMetadata");
    expect(picker).toContain("onPhotoSelected");
  });
});
```

- [ ] **Step 2: Run the contract test and verify it fails**

Run:

```bash
npm test -- components/profile/__tests__/profile-photo-picker.test.ts
```

Expected: FAIL because both components do not exist.

- [ ] **Step 3: Implement `ProfileCameraDialog`**

Use the existing exports from `components/ui/dialog.tsx` and `components/ui/button.tsx`. The component must:

```ts
type ProfileCameraDialogProps = {
  open: boolean;
  onOpenChange(open: boolean): void;
  onPhotoCaptured(file: File): void;
};

const CAPTURE_SIZE = 720;
const JPEG_QUALITY = 0.9;
```

On open, call:

```ts
const nextStream = await navigator.mediaDevices.getUserMedia({
  audio: false,
  video: { facingMode: { ideal: facingMode } },
});
videoRef.current.srcObject = nextStream;
await videoRef.current.play();
```

Before every new stream and on close/unmount, call `stopCameraStream(streamRef.current)` and clear `videoRef.current.srcObject`. Treat a missing `navigator.mediaDevices?.getUserMedia` as `unsupported` without throwing internal details into the UI.

Capture a centered square frame into a 720 x 720 canvas:

```ts
const { sx, sy, size } = getSquareCrop(video.videoWidth, video.videoHeight);
context.drawImage(video, sx, sy, size, size, 0, 0, CAPTURE_SIZE, CAPTURE_SIZE);
const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", JPEG_QUALITY));
if (!blob) throw new Error("capture_failed");
setCapturedFile(createCapturedPhotoFile(blob));
setCapturedPreviewUrl(URL.createObjectURL(blob));
```

Keep the stream active for `Retake`, but stop it on `Use photo`, close, switch camera, and unmount. Revoke the captured object URL when replaced or unmounted. Front-camera preview uses a horizontal mirror; the stored canvas frame must not be unintentionally double-mirrored.

- [ ] **Step 4: Implement `ProfilePhotoPicker`**

The shared picker must validate uploaded and captured files using `validateAvatarFileMetadata`, translate `type` and `size` failures to the existing validation keys, and display:

```tsx
<Button type="button" variant="outline" onClick={() => fileRef.current?.click()} disabled={disabled}>
  <Upload /> {tCustomer("ui.profileWizard.uploadPhoto")}
</Button>
<Button type="button" variant="outline" onClick={() => setCameraOpen(true)} disabled={disabled}>
  <Camera /> {tCustomer("ui.profileWizard.takePhoto")}
</Button>
```

Use the existing dashed preview treatment for `variant="wizard"` and the existing 64 px circular avatar treatment for `variant="compact"`. Do not upload inside this component; after validation call `onPhotoSelected(file)` exactly once.

- [ ] **Step 5: Run the component contract test**

Run:

```bash
npm test -- components/profile/__tests__/profile-photo-picker.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit the shared camera UI**

```bash
git add components/profile/profile-camera-dialog.tsx components/profile/profile-photo-picker.tsx components/profile/__tests__/profile-photo-picker.test.ts
git commit -m "feat: add shared profile camera picker"
```

---

### Task 3: Integrate both Profile entry points and localize the camera flow

**Files:**
- Modify: `app/customer/profile/page.tsx`
- Modify: `components/profile/profile-sections.tsx`
- Modify: `app/customer/profile/__tests__/profile-completion.test.ts`
- Modify: `app/i18n/locales/en/customer.json`
- Modify: `app/i18n/locales/ms/customer.json`
- Modify: `app/i18n/locales/zh-CN/customer.json`

**Interfaces:**
- Consumes `ProfilePhotoPicker` from Task 2.
- Preserves `handleFileSelect(file: File | null)` and `submitAvatar()` in the wizard.
- Preserves `uploadAvatar()` in completed Profile settings.

- [ ] **Step 1: Add failing integration assertions**

Add to `app/customer/profile/__tests__/profile-completion.test.ts`:

```ts
it("uses the same upload and camera picker in wizard and completed Profile settings", () => {
  const page = readFileSync(new URL("../page.tsx", import.meta.url), "utf8");
  const sections = readFileSync(new URL("../../../../components/profile/profile-sections.tsx", import.meta.url), "utf8");

  expect(page).toContain('import { ProfilePhotoPicker }');
  expect(page).toContain('<ProfilePhotoPicker');
  expect(sections).toContain('import { ProfilePhotoPicker }');
  expect(sections).toContain('<ProfilePhotoPicker');
  expect(page).toContain('/api/profile/avatar?type=');
  expect(page).toContain('/api/profile/avatar/confirm');
  expect(sections).toContain('/api/profile/avatar?type=');
  expect(sections).toContain('/api/profile/avatar/confirm');
});
```

- [ ] **Step 2: Run the integration contract and verify failure**

Run:

```bash
npm test -- app/customer/profile/__tests__/profile-completion.test.ts
```

Expected: FAIL because neither page imports the shared picker.

- [ ] **Step 3: Replace only the wizard Photo acquisition markup**

Remove the wizard-only hidden file input and dashed upload button, then render:

```tsx
<ProfilePhotoPicker
  variant="wizard"
  previewUrl={avatarPreview}
  error={avatarError}
  disabled={avatarBusy}
  onPhotoSelected={handleFileSelect}
  onError={setAvatarError}
/>
```

Keep the existing Save button and `submitAvatar` endpoint sequence. Change its idle label from `choosePhoto` to `savePhoto` so selection and persistence are not described as the same action.

- [ ] **Step 4: Replace only the completed-profile avatar acquisition markup**

Add a local selection handler that revokes the previous temporary preview before storing the next file:

```ts
function handleAvatarSelected(file: File) {
  setError(null);
  setAvatarFile(file);
  setAvatarPreview((previous) => {
    if (previous) URL.revokeObjectURL(previous);
    return URL.createObjectURL(file);
  });
}
```

Render:

```tsx
<ProfilePhotoPicker
  variant="compact"
  previewUrl={avatarPreview || summary.avatarUrl}
  error={error}
  disabled={busy}
  onPhotoSelected={handleAvatarSelected}
  onError={setError}
/>
```

Keep `uploadAvatar` and show the existing `Save photo` button only when `avatarFile` is present.

- [ ] **Step 5: Add complete translations**

Add the following keys under `ui.profileWizard` in all three locale files:

```json
{
  "uploadPhoto": "Upload photo",
  "takePhoto": "Take photo",
  "cameraTitle": "Take a profile photo",
  "cameraDescription": "Position your face inside the frame, then take a photo.",
  "cameraStarting": "Starting camera…",
  "cameraSwitch": "Switch camera",
  "cameraCapture": "Take photo",
  "cameraRetake": "Retake",
  "cameraUse": "Use photo",
  "cameraUnsupported": "Camera access is not available in this browser. Upload a photo instead.",
  "cameraPermissionDenied": "Camera permission was denied. Allow camera access or upload a photo instead.",
  "cameraNotFound": "No available camera was found. Upload a photo instead.",
  "cameraStartupFailed": "The camera could not be started. Upload a photo instead.",
  "cameraCaptureFailed": "The photo could not be captured. Please try again or upload a photo."
}
```

Use natural Bahasa Melayu and Simplified Chinese equivalents, preserving the same keys and interpolation behavior.

- [ ] **Step 6: Run affected tests and i18n validation**

Run:

```bash
npm test -- lib/profile/__tests__/camera-capture.test.ts lib/profile/__tests__/avatar-validation.test.ts components/profile/__tests__/profile-photo-picker.test.ts app/customer/profile/__tests__/profile-completion.test.ts components/profile/__tests__/profile-sections.test.ts
npm run verify:i18n
```

Expected: all affected tests and all i18n checks PASS.

- [ ] **Step 7: Commit the integrations**

```bash
git add app/customer/profile/page.tsx components/profile/profile-sections.tsx app/customer/profile/__tests__/profile-completion.test.ts app/i18n/locales/en/customer.json app/i18n/locales/ms/customer.json app/i18n/locales/zh-CN/customer.json
git commit -m "feat: enable profile photos from camera"
```

---

### Task 4: Final verification and camera privacy review

**Files:**
- Verification only; no planned production-file changes.

**Interfaces:**
- Verifies the complete Profile camera capture feature and unchanged backend contract.

- [ ] **Step 1: Run static verification**

Run:

```bash
npx tsc --noEmit
npm run lint
git diff --check
```

Expected: TypeScript, lint, and whitespace checks PASS.

- [ ] **Step 2: Run the final affected test set once**

Run:

```bash
npm test -- lib/profile components/profile app/customer/profile app/api/profile/avatar
```

Expected: all affected tests PASS.

- [ ] **Step 3: Perform a focused privacy and cleanup review**

Confirm from code and a browser smoke test that:

- opening the page alone does not request camera permission;
- closing the dialog turns off the device camera indicator;
- switching cameras stops the old stream before requesting a new one;
- accepting a photo stops the stream and does not upload until `Save photo`;
- denied permission shows translated fallback copy while upload still works;
- no `MediaRecorder`, video blob, camera label, device ID, stream, or exception detail is sent to an API or persisted.

- [ ] **Step 4: Manually verify supported browser behavior**

On `https://` deployment or `http://localhost`:

1. Desktop: open Profile Photo, select `Take photo`, permit webcam, capture, retake, use, save, and confirm the avatar refreshes.
2. Mobile: open the same dialog, verify the front camera is the default, switch to rear camera, switch back, capture, use, and save.
3. Upload fallback: deny camera permission, choose a valid file, and save it through the unchanged flow.
4. Validation: verify invalid MIME types and files above 2 MB remain rejected before upload and server byte validation remains active.

If verification exposes an in-scope defect, return to the exact failing task,
add a regression assertion there, apply the smallest repair, rerun that task's
focused command, and include the repaired files in that task's existing commit.
Do not create an empty verification commit.
