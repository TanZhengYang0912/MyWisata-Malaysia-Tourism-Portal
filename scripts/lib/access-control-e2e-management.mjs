import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

export const accessControlTestProject = 'ncdlaehknicabzjqskvk';

/** @param {string} ref @param {string} suffix @param {string} method @param {unknown} [body] */
export async function accessControlTestManagement(ref, suffix, method, body) {
  if (ref !== accessControlTestProject || process.env.PORTAL_E2E_TEST_DB_CONFIRM !== ref) throw new Error('Exact test project confirmation required');
  const token = process.env.SUPABASE_ACCESS_TOKEN ?? readFileSync(join(homedir(), '.supabase/access-token'), 'utf8').trim();
  const response = await fetch(`https://api.supabase.com/v1/projects/${ref}${suffix}`, {
    method, headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }), redirect: 'error', signal: AbortSignal.timeout(20_000),
  });
  if (!response.ok) throw new Error(`Test project management request failed (${response.status})`);
  return response.json();
}

/** Privileged fixture cleanup only; acceptance requests use the browser's user session. @param {string} ref @param {string} query */
export async function accessControlFixtureSql(ref, query) {
  return accessControlTestManagement(ref, '/database/query', 'POST', { query });
}
