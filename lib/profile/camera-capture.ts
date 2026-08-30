export type CameraFacingMode = "user" | "environment";

export type CameraErrorCode =
  | "unsupported"
  | "permission_denied"
  | "not_found"
  | "startup_failed"
  | "capture_failed";

export function classifyCameraError(error: unknown): CameraErrorCode {
  if (error instanceof DOMException && ["NotAllowedError", "SecurityError"].includes(error.name)) {
    return "permission_denied";
  }
  if (error instanceof DOMException && ["NotFoundError", "OverconstrainedError"].includes(error.name)) {
    return "not_found";
  }
  return "startup_failed";
}

export function getSquareCrop(width: number, height: number) {
  const size = Math.min(width, height);
  return {
    sx: Math.floor((width - size) / 2),
    sy: Math.floor((height - size) / 2),
    size,
  };
}

export function stopCameraStream(stream: MediaStream | null) {
  stream?.getTracks().forEach((track) => track.stop());
}

export function createCapturedPhotoFile(blob: Blob, now = Date.now()) {
  return new File([blob], `profile-photo-${now}.jpg`, {
    type: "image/jpeg",
    lastModified: now,
  });
}
