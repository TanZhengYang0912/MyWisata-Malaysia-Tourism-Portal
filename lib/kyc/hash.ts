export async function hashIC(icNumber: string): Promise<string> {
  const normalized = icNumber.replace(/[-\s]/g, '').toUpperCase();
  const encoded = new TextEncoder().encode(normalized);
  const hashBuffer = await crypto.subtle.digest('SHA-256', encoded);
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}
