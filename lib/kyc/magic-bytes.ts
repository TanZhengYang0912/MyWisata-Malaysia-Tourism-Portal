const SIGNATURES: Record<string, readonly number[]> = {
  'image/jpeg':     [0xff, 0xd8, 0xff],
  'image/png':      [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a],
  'application/pdf': [0x25, 0x50, 0x44, 0x46],
};

export async function validateMagicBytes(
  buffer: ArrayBuffer,
  claimedType: string,
): Promise<boolean> {
  const sig = SIGNATURES[claimedType];
  if (!sig) return false;
  const bytes = new Uint8Array(buffer, 0, sig.length);
  return sig.every((b, i) => bytes[i] === b);
}
