import { describe, expect, it, vi } from "vitest";
import {
  classifyCameraError,
  createCapturedPhotoFile,
  getSquareCrop,
  isCameraOperationCurrent,
  stopCameraStream,
} from "@/lib/profile/camera-capture";

describe("profile camera capture", () => {
  it("center-crops landscape and portrait frames", () => {
    expect(getSquareCrop(1920, 1080)).toEqual({ sx: 420, sy: 0, size: 1080 });
    expect(getSquareCrop(1080, 1920)).toEqual({ sx: 0, sy: 420, size: 1080 });
  });

  it("classifies browser camera failures without exposing exception text", () => {
    expect(classifyCameraError(new DOMException("blocked", "NotAllowedError"))).toBe("permission_denied");
    expect(classifyCameraError(new DOMException("insecure", "SecurityError"))).toBe("unsupported");
    expect(classifyCameraError(new DOMException("missing", "NotFoundError"))).toBe("not_found");
    expect(classifyCameraError(new Error("private device detail"))).toBe("startup_failed");
  });

  it("rejects stale or closed camera operations", () => {
    expect(isCameraOperationCurrent(4, 4, true)).toBe(true);
    expect(isCameraOperationCurrent(3, 4, true)).toBe(false);
    expect(isCameraOperationCurrent(4, 4, false)).toBe(false);
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
