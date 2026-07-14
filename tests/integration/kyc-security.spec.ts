import fs from 'node:fs';
import { afterEach, describe, expect, it } from 'vitest';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

function readEnv(name: string): string {
  const line = fs.readFileSync('.env.local', 'utf8').split(/\r?\n/)
    .find((entry) => entry.startsWith(`${name}=`));
  if (!line) throw new Error(`${name} is required for this integration test`);
  return line.slice(name.length + 1);
}

const url = readEnv('KYC_TEST_SUPABASE_URL');
const anonKey = readEnv('KYC_TEST_SUPABASE_ANON_KEY');
const serviceKey = readEnv('KYC_TEST_SUPABASE_SERVICE_ROLE_KEY');
const service = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });
const createdUserIds: string[] = [];

async function createEmailVerifiedClient(): Promise<{ id: string; client: SupabaseClient }> {
  const email = `kyc-security-${crypto.randomUUID()}@example.test`;
  const password = 'KycSecurityTest-123!';
  const { data, error } = await service.auth.admin.createUser({ email, password, email_confirm: true });
  if (error || !data.user) throw error ?? new Error('failed to create test user');
  createdUserIds.push(data.user.id);

  const client = createClient(url, anonKey, { auth: { autoRefreshToken: false, persistSession: false } });
  const signIn = await client.auth.signInWithPassword({ email, password });
  if (signIn.error) throw signIn.error;
  return { id: data.user.id, client };
}

afterEach(async () => {
  await Promise.all(createdUserIds.splice(0).map((id) => service.auth.admin.deleteUser(id)));
});

describe('KYC server-side security gates', () => {
  it('denies a direct withdrawal RPC call from a user without KYC', async () => {
    const { id, client } = await createEmailVerifiedClient();
    await service.from('wallets').update({ earnings_sen: 10_000 }).eq('user_id', id);

    const { error } = await client.rpc('debit_withdrawal', { p_user_id: id, p_amount_rm: 10 });

    expect(error?.message).toContain('kyc_required');
  });

  it('denies a direct recommendation RPC call below profile_complete', async () => {
    const { client } = await createEmailVerifiedClient();

    const { error } = await client.rpc('submit_recommendation', {
      p_vendor_name: 'Direct RPC Gate Test',
      p_description: 'A direct RPC submission must be rejected below the required verification tier.',
      p_state: 'Selangor',
      p_category_id: null,
      p_vendor_address: null,
    });

    expect(error?.message).toContain('tier_insufficient');
  });

  it('creates a draft but refuses to finalise it without both immutable document objects', async () => {
    const { id, client } = await createEmailVerifiedClient();
    await service.from('users').update({ tier: 'profile_complete' }).eq('id', id);

    const { data: submissionId, error: beginError } = await client.rpc('begin_kyc_submission', {
      p_ic_hash: 'a'.repeat(64),
      p_ic_hash_version: 'hmac_sha256_v1',
      p_doc_type: 'national_id',
    });
    expect(beginError).toBeNull();
    expect(submissionId).toMatch(/^[0-9a-f-]{36}$/i);

    const { error: finaliseError } = await client.rpc('finalize_kyc_submission', {
      p_submission_id: submissionId,
      p_front_path: `${id}/${submissionId}/front.jpg`,
      p_back_path: `${id}/${submissionId}/back.jpg`,
    });
    expect(finaliseError?.message).toContain('documents_missing');
  });
});
