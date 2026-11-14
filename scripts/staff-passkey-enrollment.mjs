// Operator-only, supervised enrollment or recovery. Never run automatically.
import { createHash, randomBytes } from 'node:crypto';
import { parseArgs } from 'node:util';
import { createClient } from '@supabase/supabase-js';
try { process.loadEnvFile('.env.local'); } catch { /* Operator runtime may inject env. */ }
const { values } = parseArgs({ options: { user: { type: 'string' }, reason: { type: 'string' }, recover: { type: 'boolean', default: false }, 'confirm-user': { type: 'string' }, 'allow-remote': { type: 'boolean', default: false }, 'confirm-host': { type: 'string' } } });
if (!values.user || !/^[0-9a-f-]{36}$/i.test(values.user) || !values.reason || values.reason.trim().length < 10 || values['confirm-user'] !== values.user) {
  throw new Error('Supply --user <UUID> --confirm-user <same UUID> --reason <identity-verification reference>. --recover explicitly revokes existing devices.');
}
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) throw new Error('Operator Supabase service configuration is required');
// Environment gate: .env.local points at the hosted project, so a missing local env file
// must never silently fall through to real data. Hosted targets need an explicit opt-in.
let host;
try { host = new URL(url).hostname; } catch { throw new Error('NEXT_PUBLIC_SUPABASE_URL is not a valid URL'); }
const isLocalTarget = ['localhost', '127.0.0.1', '[::1]'].includes(host) || host.endsWith('.localhost');
console.error(`Target Supabase: ${host} (${isLocalTarget ? 'local' : 'REMOTE'})`);
if (!isLocalTarget && !(values['allow-remote'] && values['confirm-host'] === host)) {
  throw new Error(`Refusing to issue a grant on remote host ${host}. Use a local env file, or pass --allow-remote --confirm-host ${host} after identity verification.`);
}
const client = createClient(url,key,{ auth: { autoRefreshToken: false,persistSession: false } });
const token = randomBytes(32).toString('base64url');
const { error } = await client.rpc('issue_staff_passkey_enrollment_grant', {
  p_user_id: values.user,p_token_hash: createHash('sha256').update(token).digest('hex'),p_reason: values.reason.trim(),p_recovery: values.recover,
});
if (error) throw new Error('Enrollment grant could not be issued; check target account eligibility and deployed migration');
console.log('One-time enrollment code (valid 15 minutes; share only with the identity-verified account holder):');
console.log(token);
