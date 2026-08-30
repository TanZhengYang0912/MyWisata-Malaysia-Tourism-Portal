import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("shared Profile photo acquisition", () => {
  const dialogPath = resolve(process.cwd(), "components/profile/profile-camera-dialog.tsx");
  const pickerPath = resolve(process.cwd(), "components/profile/profile-photo-picker.tsx");

  it("starts camera only from the dialog and cleans up every exit", () => {
    const dialog = readFileSync(dialogPath, "utf8");
    expect(dialog).toContain("navigator.mediaDevices.getUserMedia");
    expect(dialog).toContain("stopCameraStream");
    expect(dialog).toContain("playsInline");
    expect(dialog).toContain("facingMode: { ideal: facingMode }");
    expect(dialog).toContain("window.isSecureContext");
    expect(dialog).toContain("video.readyState");
    expect(dialog).toContain("requestId !== requestIdRef.current");
    expect(dialog).not.toContain("MediaRecorder");
  });

  it("offers separate upload and camera actions through one validated file callback", () => {
    const picker = readFileSync(pickerPath, "utf8");
    expect(picker).toContain('type="file"');
    expect(picker).toContain("ProfileCameraDialog");
    expect(picker).toContain("validateAvatarFileMetadata");
    expect(picker).toContain("onPhotoSelected");
  });
});
