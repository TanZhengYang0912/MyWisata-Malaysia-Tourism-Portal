const TOKEN_TTL_MS = 15 * 60 * 1000;

type HandoffPayload = {
  ownerId: string;
  subject: string;
  summary: string;
  sourceMessageId?: string;
  expiresAt: number;
};

function base64UrlEncode(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function base64UrlDecode(value: string): ArrayBuffer {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  const binary = atob(normalized + '='.repeat((4 - normalized.length % 4) % 4));
  return Uint8Array.from(binary, (character) => character.charCodeAt(0)).buffer;
}

async function signingKey(): Promise<CryptoKey> {
  const secret = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!secret) throw new Error('Support handoff signing is not configured');
  return crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);
}

export async function createHandoffToken(ownerId: string, subject: string, summary: string, sourceMessageId?: string): Promise<string> {
  const payload: HandoffPayload = { ownerId, subject, summary, sourceMessageId, expiresAt: Date.now() + TOKEN_TTL_MS };
  const encoded = base64UrlEncode(new TextEncoder().encode(JSON.stringify(payload)));
  const signature = new Uint8Array(await crypto.subtle.sign('HMAC', await signingKey(), new TextEncoder().encode(encoded)));
  return `${encoded}.${base64UrlEncode(signature)}`;
}

export async function verifyHandoffToken(token: string, ownerId: string, subject: string, summary: string): Promise<boolean> {
  const [encoded, signature, extra] = token.split('.');
  if (!encoded || !signature || extra) return false;
  try {
    const payload = JSON.parse(new TextDecoder().decode(base64UrlDecode(encoded))) as HandoffPayload;
    if (payload.ownerId !== ownerId || payload.subject !== subject || payload.summary !== summary || payload.expiresAt < Date.now()) return false;
    return crypto.subtle.verify('HMAC', await signingKey(), base64UrlDecode(signature), new TextEncoder().encode(encoded));
  } catch {
    return false;
  }
}
