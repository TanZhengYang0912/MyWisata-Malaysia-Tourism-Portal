type Signature = { offset: number; bytes: readonly number[] };

const SIGNATURES: Record<string, readonly Signature[]> = {
  'image/jpeg':      [{ offset: 0, bytes: [0xff, 0xd8, 0xff] }],
  'image/png':       [{ offset: 0, bytes: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] }],
  'application/pdf': [{ offset: 0, bytes: [0x25, 0x50, 0x44, 0x46] }],
  // WEBP is a RIFF container — "RIFF" at 0 alone also matches WAV/AVI, so this
  // also checks the "WEBP" format tag at offset 8.
  'image/webp':      [{ offset: 0, bytes: [0x52, 0x49, 0x46, 0x46] }, { offset: 8, bytes: [0x57, 0x45, 0x42, 0x50] }],
};

export async function validateMagicBytes(
  buffer: ArrayBuffer,
  claimedType: string,
): Promise<boolean> {
  const checks = SIGNATURES[claimedType];
  if (!checks) return false;
  const bytes = new Uint8Array(buffer);
  return checks.every(
    ({ offset, bytes: sig }) => bytes.length >= offset + sig.length && sig.every((b, i) => bytes[offset + i] === b),
  );
}
