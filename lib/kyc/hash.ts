export async function hashIC(icNumber: string): Promise<string> {
  const normalized = normalizeIC(icNumber);
  const encoded = new TextEncoder().encode(normalized);
  const hashBuffer = await crypto.subtle.digest('SHA-256', encoded);
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export function normalizeIC(icNumber: string): string {
  return icNumber.replace(/[-\s]/g, '').toUpperCase();
}

export async function hashICWithHmac(
  icNumber: string,
  secret = process.env.KYC_IC_HMAC_KEY,
): Promise<{ algorithm: 'hmac_sha256_v1'; value: string }> {
  if (!secret) throw new Error('KYC_IC_HMAC_KEY must be configured');

  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(normalizeIC(icNumber)));
  const value = Array.from(new Uint8Array(signature))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');

  return { algorithm: 'hmac_sha256_v1', value };
}
