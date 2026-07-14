import fs from 'node:fs';
import { afterEach, describe, expect, it } from 'vitest';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const runIntegration = process.env.RUN_KYC_DB_INTEGRATION === '1';

function readEnv(name: string): string | undefined {
  if (!runIntegration) return undefined;
  const line = fs.readFileSync('.env.local', 'utf8').split(/\r?\n/)
    .find((entry) => entry.startsWith(`${name}=`));
  if (!line) throw new Error(`${name} is required for this integration test`);
  return line.slice(name.length + 1);
}

const url = readEnv('KYC_TEST_SUPABASE_URL');
const anonKey = readEnv('KYC_TEST_SUPABASE_ANON_KEY');
const serviceKey = readEnv('KYC_TEST_SUPABASE_SERVICE_ROLE_KEY');
const service = runIntegration
  ? createClient(url!, serviceKey!, { auth: { autoRefreshToken: false, persistSession: false } })
  : null;
const createdUserIds: string[] = [];

async function createEmailVerifiedClient(): Promise<{ id: string; client: SupabaseClient }> {
  const email = `kyc-security-${crypto.randomUUID()}@example.test`;
  const password = 'KycSecurityTest-123!';
  const { data, error } = await service!.auth.admin.createUser({ email, password, email_confirm: true });
  if (error || !data.user) throw error ?? new Error('failed to create test user');
  createdUserIds.push(data.user.id);

  const client = createClient(url!, anonKey!, { auth: { autoRefreshToken: false, persistSession: false } });
  const signIn = await client.auth.signInWithPassword({ email, password });
  if (signIn.error) throw signIn.error;
  return { id: data.user.id, client };
}

async function beginServerSubmission(userId: string, hash = 'a'.repeat(64)): Promise<string> {
  const { data, error } = await service!.rpc('begin_kyc_submission', {
    p_user_id: userId,
    p_ic_hash: hash,
    p_ic_hash_version: 'hmac_sha256_v1',
    p_doc_type: 'national_id',
  });
  expect(error).toBeNull();
  expect(data).toMatch(/^[0-9a-f-]{36}$/i);
  return data as string;
}

function evidencePaths(userId: string, submissionId: string) {
  const token = crypto.randomUUID();
  return {
    front: `${userId}/${submissionId}/${token}/front.jpg`,
    back: `${userId}/${submissionId}/${token}/back.jpg`,
  };
}

async function uploadEvidence(paths: { front: string; back: string }) {
  const bytes = new Uint8Array([0xff, 0xd8, 0xff, 0xd9]);
  expect((await service!.storage.from('kyc-documents').upload(paths.front, bytes, { contentType: 'image/jpeg' })).error).toBeNull();
  expect((await service!.storage.from('kyc-documents').upload(paths.back, bytes, { contentType: 'image/jpeg' })).error).toBeNull();
}

async function createAdminClient(): Promise<{ id: string; client: SupabaseClient }> {
  const admin = await createEmailVerifiedClient();
  const { data: role, error } = await service!.from('roles')
    .upsert({ name: 'approver', description: 'KYC integration-test approver' }, { onConflict: 'name' })
    .select('id')
    .single();
  expect(error).toBeNull();
  expect((await service!.from('user_roles').insert({ user_id: admin.id, role_id: role!.id })).error).toBeNull();
  return admin;
}

afterEach(async () => {
  if (service) await Promise.all(createdUserIds.splice(0).map((id) => service.auth.admin.deleteUser(id)));
});

describe.skipIf(!runIntegration)('KYC server-side security gates', () => {
  it('denies a direct withdrawal RPC call from a user without KYC', async () => {
    const { id, client } = await createEmailVerifiedClient();
    await service!.from('wallets').update({ earnings_sen: 10_000 }).eq('user_id', id);
    expect((await client.rpc('debit_withdrawal', { p_user_id: id, p_amount_rm: 10 })).error?.message).toContain('kyc_required');
  });

  it('denies a direct recommendation RPC call below profile_complete', async () => {
    const { client } = await createEmailVerifiedClient();
    expect((await client.rpc('submit_recommendation', {
      p_vendor_name: 'Direct RPC Gate Test',
      p_description: 'A direct RPC submission must be rejected below the required verification tier.',
      p_state: 'Selangor', p_category_id: null, p_vendor_address: null,
    })).error?.message).toContain('tier_insufficient');
  });

  it('allows only the server boundary to create a draft with an HMAC fingerprint', async () => {
    const { id, client } = await createEmailVerifiedClient();
    await service!.from('users').update({ tier: 'profile_complete' }).eq('id', id);
    const submissionId = await beginServerSubmission(id);

    const { error } = await client.rpc('begin_kyc_submission', {
      p_user_id: id, p_ic_hash: 'b'.repeat(64), p_ic_hash_version: 'hmac_sha256_v1', p_doc_type: 'national_id',
    });
    expect(error?.message).toContain('permission denied');
    expect(submissionId).toMatch(/^[0-9a-f-]{36}$/i);
  });

  it('binds random-token front and back paths to the caller draft and requires both objects', async () => {
    const { id, client } = await createEmailVerifiedClient();
    await service!.from('users').update({ tier: 'profile_complete' }).eq('id', id);
    const submissionId = await beginServerSubmission(id);
    const paths = evidencePaths(id, submissionId);

    expect((await client.rpc('finalize_kyc_submission', {
      p_submission_id: submissionId, p_front_path: paths.front, p_back_path: paths.back,
    })).error?.message).toContain('documents_missing');
    expect((await client.rpc('finalize_kyc_submission', {
      p_submission_id: submissionId,
      p_front_path: `${id}/${submissionId}/front.jpg`,
      p_back_path: `${id}/${submissionId}/back.jpg`,
    })).error?.message).toContain('invalid_document_path');

    const bytes = new Uint8Array([0xff, 0xd8, 0xff, 0xd9]);
    expect((await service!.storage.from('kyc-documents').upload(paths.front, bytes, { contentType: 'image/jpeg' })).error).toBeNull();
    expect((await client.rpc('finalize_kyc_submission', {
      p_submission_id: submissionId, p_front_path: paths.front, p_back_path: paths.back,
    })).error?.message).toContain('documents_missing');
    expect((await service!.storage.from('kyc-documents').upload(paths.back, bytes, { contentType: 'image/jpeg' })).error).toBeNull();
    expect((await client.rpc('finalize_kyc_submission', {
      p_submission_id: submissionId, p_front_path: paths.front, p_back_path: paths.back,
    })).error).toBeNull();
  });

  it('does not leave legacy single-document submission or evidence metadata available to applicants', async () => {
    const { id, client } = await createEmailVerifiedClient();
    await service!.from('users').update({ tier: 'profile_complete' }).eq('id', id);
    const submissionId = await beginServerSubmission(id, 'c'.repeat(64));
    const paths = evidencePaths(id, submissionId);
    await uploadEvidence(paths);
    expect((await client.rpc('finalize_kyc_submission', {
      p_submission_id: submissionId, p_front_path: paths.front, p_back_path: paths.back,
    })).error).toBeNull();

    expect((await client.rpc('submit_kyc', {
      p_user_id: id, p_ic_hash: 'd'.repeat(64), p_doc_type: 'national_id', p_doc_url: `${id}/legacy.jpg`,
    })).error?.message).toContain('permission denied');
    const { data, error } = await client.from('kyc_submission_documents').select('storage_path').eq('submission_id', submissionId);
    expect(error).toBeTruthy();
    expect(data).toBeNull();
    const storage = client.storage.from('kyc-documents');
    expect((await storage.download(paths.front)).error).toBeTruthy();
    expect((await storage.upload(`${id}/browser-insert.jpg`, new Uint8Array([0xff, 0xd8, 0xff, 0xd9]), { contentType: 'image/jpeg' })).error).toBeTruthy();
    expect((await storage.update(paths.front, new Uint8Array([0xff, 0xd8, 0xff, 0xd9]), { contentType: 'image/jpeg' })).error).toBeTruthy();
    // Storage DELETE is an RLS-filtered no-op (the API may still return 200),
    // so prove the authenticated caller cannot actually remove the object.
    expect((await storage.remove([paths.front])).error).toBeNull();
    expect((await service!.storage.from('kyc-documents').download(paths.front)).error).toBeNull();
  });

  it('keeps raw document paths behind the server-only view boundary and audits safely', async () => {
    const { id: applicantId, client: applicant } = await createEmailVerifiedClient();
    await service!.from('users').update({ tier: 'profile_complete' }).eq('id', applicantId);
    const submissionId = await beginServerSubmission(applicantId, 'e'.repeat(64));
    const paths = evidencePaths(applicantId, submissionId);
    await uploadEvidence(paths);
    expect((await applicant.rpc('finalize_kyc_submission', {
      p_submission_id: submissionId, p_front_path: paths.front, p_back_path: paths.back,
    })).error).toBeNull();
    const admin = await createAdminClient();

    const browserView = await admin.client.rpc('get_kyc_document_view', { p_submission_id: submissionId, p_side: 'front' });
    expect(browserView.error).toBeTruthy();
    expect(browserView.error?.message).not.toContain(paths.front);
    const nonAdminView = await service!.rpc('get_kyc_document_view', {
      p_submission_id: submissionId, p_side: 'front', p_actor_id: applicantId,
    });
    expect(nonAdminView.error?.message).toContain('admin_required');
    const { data: path, error } = await service!.rpc('get_kyc_document_view', {
      p_submission_id: submissionId, p_side: 'front', p_actor_id: admin.id,
    });
    expect(error).toBeNull();
    expect(path).toBe(paths.front);
    const { data: audits } = await service!.from('audit_logs').select('after_data').eq('action', 'kyc.document_viewed').eq('entity_id', submissionId);
    expect(audits).toHaveLength(1);
    expect(audits![0].after_data).toEqual({ submission_id: submissionId, side: 'front' });
    expect(Object.keys(audits![0].after_data as Record<string, unknown>).sort()).toEqual(['side', 'submission_id']);
    expect(JSON.stringify(audits![0].after_data)).not.toMatch(/path|hash|url/i);
  });

  it('enforces structured review reason restrictions and prevents self-dealing at the RPC boundary', async () => {
    const { id: applicantId, client: applicant } = await createEmailVerifiedClient();
    await service!.from('users').update({ tier: 'profile_complete' }).eq('id', applicantId);
    const submissionId = await beginServerSubmission(applicantId, 'f'.repeat(64));
    const paths = evidencePaths(applicantId, submissionId);
    await uploadEvidence(paths);
    expect((await applicant.rpc('finalize_kyc_submission', {
      p_submission_id: submissionId, p_front_path: paths.front, p_back_path: paths.back,
    })).error).toBeNull();
    const admin = await createAdminClient();

    expect((await admin.client.rpc('admin_review_kyc', {
      p_user_id: applicantId, p_action: null, p_reason_code: null, p_reason_detail: null,
    })).error?.message).toContain('invalid_action');
    expect((await admin.client.rpc('admin_review_kyc', {
      p_user_id: applicantId, p_action: 'reject', p_reason_code: null, p_reason_detail: null,
    })).error?.message).toContain('invalid_reason_code');
    expect((await admin.client.rpc('admin_review_kyc', {
      p_user_id: applicantId, p_action: 'reject', p_reason: null,
    })).error?.message).toContain('invalid_reason_code');
    expect((await admin.client.rpc('admin_review_kyc', {
      p_user_id: applicantId, p_action: 'reject', p_reason_code: 'unknown', p_reason_detail: null,
    })).error?.message).toContain('invalid_reason_code');
    expect((await admin.client.rpc('admin_review_kyc', {
      p_user_id: applicantId, p_action: 'reject', p_reason_code: 'document_unreadable', p_reason_detail: 'A supplied detail is not allowed.',
    })).error?.message).toContain('reason_detail_not_allowed');
    expect((await admin.client.rpc('admin_review_kyc', {
      p_user_id: applicantId, p_action: 'reject', p_reason_code: 'other', p_reason_detail: '  too short  ',
    })).error?.message).toContain('reason_detail_too_short');
    expect((await admin.client.rpc('admin_review_kyc', {
      p_user_id: applicantId, p_action: 'request_info', p_reason_code: 'document_suspected_tampering', p_reason_detail: null,
    })).error?.message).toContain('reason_code_not_allowed');

    await service!.from('users').update({ tier: 'profile_complete' }).eq('id', admin.id);
    const adminSubmissionId = await beginServerSubmission(admin.id, '0'.repeat(64));
    const adminPaths = evidencePaths(admin.id, adminSubmissionId);
    await uploadEvidence(adminPaths);
    expect((await admin.client.rpc('finalize_kyc_submission', {
      p_submission_id: adminSubmissionId, p_front_path: adminPaths.front, p_back_path: adminPaths.back,
    })).error).toBeNull();
    expect((await admin.client.rpc('admin_review_kyc', {
      p_user_id: admin.id, p_action: 'reject', p_reason_code: 'document_unreadable', p_reason_detail: null,
    })).error?.message).toContain('self_dealing');
  });

  it('claims each expired evidence side once using rejected and superseded retention and preserves submission metadata', async () => {
    const { id, client } = await createEmailVerifiedClient();
    await service!.from('users').update({ tier: 'profile_complete' }).eq('id', id);
    const oldRetentionStart = new Date(Date.now() - 91 * 24 * 60 * 60 * 1000).toISOString();
    const fixtures = (['rejected', 'superseded'] as const).map((status, index) => ({
      status,
      hash: String(index + 1).repeat(64),
    }));
    const submissions = [] as Array<{ id: string; paths: ReturnType<typeof evidencePaths>; status: (typeof fixtures)[number]['status'] }>;

    for (const fixture of fixtures) {
      const submissionId = await beginServerSubmission(id, fixture.hash);
      const paths = evidencePaths(id, submissionId);
      await uploadEvidence(paths);
      expect((await client.rpc('finalize_kyc_submission', {
        p_submission_id: submissionId, p_front_path: paths.front, p_back_path: paths.back,
      })).error).toBeNull();
      const { error } = await service!.from('kyc_submissions').update({
        status: fixture.status, evidence_retention_started_at: oldRetentionStart,
      }).eq('id', submissionId);
      expect(error).toBeNull();
      submissions.push({ id: submissionId, paths, status: fixture.status });
    }

    expect((await client.rpc('purge_expired_kyc_evidence')).error?.message).toContain('permission denied');
    const { data: worklist, error } = await service!.rpc('purge_expired_kyc_evidence');
    expect(error).toBeNull();
    const claimed = (worklist as Array<{ submission_id: string; side: string; storage_path: string }>)
      .filter((item) => submissions.some((submission) => submission.id === item.submission_id));
    expect(claimed).toHaveLength(4);
    expect(claimed).toEqual(expect.arrayContaining(submissions.flatMap(({ id: submissionId, paths }) => [
      { submission_id: submissionId, side: 'back', storage_path: paths.back },
      { submission_id: submissionId, side: 'front', storage_path: paths.front },
    ])));
    expect(((await service!.rpc('purge_expired_kyc_evidence')).data as Array<{ submission_id: string }>)
      .filter((item) => submissions.some((submission) => submission.id === item.submission_id))).toEqual([]);
    for (const item of claimed) {
      expect((await service!.storage.from('kyc-documents').remove([item.storage_path])).error).toBeNull();
      expect((await service!.rpc('confirm_purged_kyc_evidence', { p_submission_id: item.submission_id, p_side: item.side })).error).toBeNull();
    }
    for (const submission of submissions) {
      const { data: metadata, error: metadataError } = await service!.from('kyc_submissions')
        .select('id, status').eq('id', submission.id).maybeSingle();
      expect(metadataError).toBeNull();
      expect(metadata).toEqual({ id: submission.id, status: submission.status });
      expect((await service!.storage.from('kyc-documents').download(submission.paths.front)).error).not.toBeNull();
      expect((await service!.storage.from('kyc-documents').download(submission.paths.back)).error).not.toBeNull();
    }
    const { data: audits } = await service!.from('audit_logs').select('after_data').eq('action', 'kyc.evidence_purged')
      .in('entity_id', submissions.map((submission) => submission.id));
    expect(audits).toHaveLength(4);
    for (const audit of audits ?? []) {
      const payload = audit.after_data as Record<string, unknown>;
      expect(payload).toEqual({ submission_id: expect.any(String), side: expect.stringMatching(/^(front|back)$/) });
      expect(Object.keys(payload).sort()).toEqual(['side', 'submission_id']);
      expect(submissions.map((submission) => submission.id)).toContain(payload.submission_id);
      expect(JSON.stringify(payload)).not.toMatch(/path|hash|url/i);
    }
  }, 30_000);

  it('retains approved evidence until account closure or a sufficiently old replacement', async () => {
    const { id, client } = await createEmailVerifiedClient();
    await service!.from('users').update({ tier: 'profile_complete' }).eq('id', id);
    const submissionId = await beginServerSubmission(id, '2'.repeat(64));
    const paths = evidencePaths(id, submissionId);
    await uploadEvidence(paths);
    expect((await client.rpc('finalize_kyc_submission', {
      p_submission_id: submissionId, p_front_path: paths.front, p_back_path: paths.back,
    })).error).toBeNull();
    const oldReview = new Date(Date.now() - 91 * 24 * 60 * 60 * 1000).toISOString();
    await service!.from('kyc_submissions').update({ status: 'approved', reviewed_at: oldReview }).eq('id', submissionId);
    await service!.from('users').update({ status: 'active', closed_at: null }).eq('id', id);

    const activeResult = await service!.rpc('purge_expired_kyc_evidence');
    expect((activeResult.data as Array<{ submission_id: string }>).some((item) => item.submission_id === submissionId)).toBe(false);

    const replacementId = await beginServerSubmission(id, '3'.repeat(64));
    const replacementPaths = evidencePaths(id, replacementId);
    await uploadEvidence(replacementPaths);
    expect((await client.rpc('finalize_kyc_submission', {
      p_submission_id: replacementId, p_front_path: replacementPaths.front, p_back_path: replacementPaths.back,
    })).error).toBeNull();
    const replacementReview = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000 - 1_000).toISOString();
    await service!.from('kyc_submissions').update({ status: 'approved', reviewed_at: replacementReview }).eq('id', replacementId);
    const replacementResult = await service!.rpc('purge_expired_kyc_evidence');
    const replacementClaimed = (replacementResult.data as Array<{ submission_id: string; side: 'front' | 'back'; storage_path: string }>)
      .filter((item) => item.submission_id === submissionId);
    expect(replacementClaimed).toHaveLength(2);
    for (const item of replacementClaimed) {
      expect((await service!.storage.from('kyc-documents').remove([item.storage_path])).error).toBeNull();
      expect((await service!.rpc('confirm_purged_kyc_evidence', { p_submission_id: item.submission_id, p_side: item.side })).error).toBeNull();
    }

    await service!.from('users').update({ status: 'deleted', closed_at: oldReview }).eq('id', id);
    const closedResult = await service!.rpc('purge_expired_kyc_evidence');
    const claimed = (closedResult.data as Array<{ submission_id: string; side: 'front' | 'back'; storage_path: string }>)
      .filter((item) => item.submission_id === replacementId);
    expect(claimed).toHaveLength(2);
    for (const item of claimed) {
      expect((await service!.storage.from('kyc-documents').remove([item.storage_path])).error).toBeNull();
      expect((await service!.rpc('confirm_purged_kyc_evidence', { p_submission_id: item.submission_id, p_side: item.side })).error).toBeNull();
    }
    expect((await service!.from('kyc_submissions').select('id').eq('id', submissionId).maybeSingle()).data?.id).toBe(submissionId);
    expect((await service!.from('kyc_submissions').select('id').eq('id', replacementId).maybeSingle()).data?.id).toBe(replacementId);
  });
});
