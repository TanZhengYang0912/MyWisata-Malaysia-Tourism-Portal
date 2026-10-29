import 'server-only';
import { isDemoToolRuntimeEnabled } from '@/lib/demo/runtime';
import { BRAND_NAME } from '@/lib/i18n/invariant-tokens';

export type StaffPasskeyConfig = { rpID: string; origin: string; rpName: string };

/** Explicit pre-rollout compatibility for a localhost development app only. */
export function staffPasskeyEnforcementEnabled(env: Record<string, string | undefined> = process.env): boolean {
  if (env.NODE_ENV !== 'development' || env.MYWISATA_LOCAL_LEGACY_STAFF_AUTH !== 'true'
    || (env.MYWISATA_ENV && !['development', 'local'].includes(env.MYWISATA_ENV))
    || (env.VERCEL_ENV && env.VERCEL_ENV !== 'development')
    || !isDemoToolRuntimeEnabled({ NODE_ENV: env.NODE_ENV, MYWISATA_DEMO_TOOLS: env.MYWISATA_DEMO_TOOLS, MYWISATA_ENV: env.MYWISATA_ENV, VERCEL_ENV: env.VERCEL_ENV })) return true;
  try {
    const url = new URL(env.NEXT_PUBLIC_SITE_URL ?? '');
    return !(['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)
      && ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password
      && url.pathname === '/' && !url.search && !url.hash);
  } catch { return true; }
}

export function staffPasskeyConfig(env: Record<string, string | undefined> = process.env): StaffPasskeyConfig {
  const configured = env.STAFF_PASSKEY_ORIGIN ?? env.NEXT_PUBLIC_SITE_URL;
  if (!configured) throw new Error('Staff Passkey origin is not configured');
  const url = new URL(configured);
  const local = url.hostname === 'localhost' || url.hostname === '127.0.0.1';
  if (url.username || url.password || url.pathname !== '/' || url.search || url.hash
    || (url.protocol !== 'https:' && !(local && env.NODE_ENV !== 'production' && url.protocol === 'http:'))
    || (env.NODE_ENV === 'production' && local)) throw new Error('Invalid staff Passkey origin');
  return { rpID: url.hostname, origin: url.origin, rpName: BRAND_NAME };
}
