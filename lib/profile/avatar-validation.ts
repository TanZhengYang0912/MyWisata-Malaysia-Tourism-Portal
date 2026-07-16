export const AVATAR_MAX_BYTES = 2 * 1024 * 1024;

const SIGNATURES: Record<string, Array<{ offset: number; bytes: number[] }>> = {
  "image/jpeg": [{ offset: 0, bytes: [0xff, 0xd8, 0xff] }],
  "image/png": [{ offset: 0, bytes: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] }],
  "image/webp": [
    { offset: 0, bytes: [0x52, 0x49, 0x46, 0x46] },
    { offset: 8, bytes: [0x57, 0x45, 0x42, 0x50] },
  ],
};

export function validateAvatarBytes(bytes: Uint8Array, claimedType?: string): { ok: true; type: string } | { ok: false; message: string } {
  if (bytes.byteLength > AVATAR_MAX_BYTES) return { ok: false, message: "Image must be under 2 MB." };
  const candidates = claimedType ? [claimedType] : Object.keys(SIGNATURES);
  const type = candidates.find((candidate) => {
    const signatures = SIGNATURES[candidate];
    return signatures?.every(({ offset, bytes: signature }) => signature.every((value, index) => bytes[offset + index] === value));
  });
  return type ? { ok: true, type } : { ok: false, message: "The uploaded file is not a valid JPG, PNG, or WebP image." };
}
