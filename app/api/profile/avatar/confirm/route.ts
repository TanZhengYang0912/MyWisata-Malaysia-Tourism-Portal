import { apiFail } from '@/lib/validation/schemas';

/** The former client-controlled Storage path confirmation flow is retired. */
export async function POST() {
  const response = apiFail('AVATAR_FLOW_RETIRED', 'Upload profile photos through the current profile form', 410);
  response.headers.set('Cache-Control', 'private, no-store, max-age=0');
  response.headers.set('Referrer-Policy', 'no-referrer');
  return response;
}
