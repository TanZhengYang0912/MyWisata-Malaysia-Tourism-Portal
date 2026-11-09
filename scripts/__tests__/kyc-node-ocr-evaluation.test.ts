import { afterEach, expect, it, vi } from 'vitest';
import { mkdtemp, chmod, writeFile, rm, realpath } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import sharp from 'sharp';
import { loadAuthorizedSamples, loadPrivateStudyTruth, evaluateSamples, sealStudyRegistry, normalizeEvaluationField, makeCorruptionVariant } from '../lib/kyc-node-ocr-evaluation.mjs';
import { extractKycFieldsInNode } from '../../lib/kyc/node-ocr-engine';
import { prepareKycEvidenceImage } from '../../lib/kyc/evidence-image';
import { fixtureSvg } from '../../lib/kyc/runtime/ocr-synthetic-fixtures.cjs';
afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); });

function studyRow(overrides = {}) {
  return { caseId: randomUUID(), personGroup: randomUUID(), documentGroup: randomUUID(), reviewCaseGroup: randomUUID(),
    split: 'development', source: 'authorized-mykad', layout: 'mykad-labelled', truthStatus: 'double-checked',
    documentType: 'national_id', group: 'assisted', stage: 'initial', ...overrides };
}
async function privateStudy(run: (context: { root: string; registry: ReturnType<typeof studyRow>[]; manifest: Record<string, unknown>; env: Record<string, string>; save: () => Promise<void> }) => Promise<void>) {
  const root = await realpath(await mkdtemp(path.join(tmpdir(), 'kyc-v2-test-')));
  try {
    await chmod(root, 0o700);
    for (const filename of ['front.png', 'back.png']) await writeFile(path.join(root, filename), new Uint8Array([1, 2, 3]), { mode: 0o600 });
    const registry = [studyRow(), studyRow({ split: 'holdout' })];
    const manifest = { schemaVersion: 2, protocolVersion: 'kyc-ocr-study-v2', registry, selection: registry.map(row => row.caseId), scenario: 'reference',
      cases: registry.map(row => ({ ...row, front: 'front.png', back: 'back.png', expectedHolderName: 'PRIVATE GOLD', expectedDocumentNumber: '990101140001', profile: null })) };
    const save = () => writeFile(path.join(root, 'manifest.json'), JSON.stringify(manifest), { mode: 0o600 });
    const env = { KYC_NODE_OCR_EVALUATION: '1', KYC_NODE_OCR_SAMPLE_MANIFEST: path.join(root, 'manifest.json'), KYC_NODE_OCR_STUDY_SEAL: sealStudyRegistry(registry) };
    await save(); await run({ root, registry, manifest, env, save });
  } finally { await rm(root, { recursive: true, force: true }); }
}

it('uses a sealed complete registry and rejects an omitted or reassigned holdout before reading images', async () => {
  await privateStudy(async ({ root, registry, manifest, env, save }) => {
    expect(sealStudyRegistry([...registry].reverse())).toBe(env.KYC_NODE_OCR_STUDY_SEAL);
    const opened = vi.spyOn(fs, 'open');
    await expect(loadAuthorizedSamples({ ...env, KYC_NODE_OCR_STUDY_SEAL: '' })).rejects.toThrow('sample_manifest_invalid');
    expect(opened.mock.calls.every(([filename]) => filename === path.join(root, 'manifest.json'))).toBe(true);
    registry[1].split = 'development'; await save();
    await rm(path.join(root, 'front.png'));
    await expect(loadAuthorizedSamples(env)).rejects.toThrow('sample_manifest_invalid');
    registry.pop(); manifest.selection = [registry[0].caseId]; await save();
    await expect(loadAuthorizedSamples(env)).rejects.toThrow('sample_manifest_invalid');
  });
});
it('rejects the same person or document across splits even when the registry is resealed', async () => {
  await privateStudy(async ({ registry }) => {
    expect(() => sealStudyRegistry([{ ...registry[0] }, { ...registry[1], personGroup: registry[0].personGroup }])).toThrow('sample_manifest_invalid');
    expect(() => sealStudyRegistry([{ ...registry[0] }, { ...registry[1], documentGroup: registry[0].documentGroup }])).toThrow('sample_manifest_invalid');
  });
});
it('requires reference images for manual review instead of silently ignoring a declared corruption', async () => {
  await privateStudy(async ({ manifest, env, save }) => {
    const manualEnv = { ...env, KYC_NODE_OCR_REVIEW_SESSION: '1' };
    const reference = await loadAuthorizedSamples(manualEnv, true);
    expect(Array.isArray(reference)).toBe(false);
    manifest.scenario = 'jpeg-75'; await save();
    await expect(loadAuthorizedSamples(manualEnv, true)).rejects.toThrow('sample_manifest_invalid');
  });
});
it('streams v2 one pair at a time and clears bytes on early iterator return', async () => {
  await privateStudy(async ({ root, env }) => {
    const samples = await loadAuthorizedSamples(env);
    if (Array.isArray(samples)) throw new Error('expected_v2_stream');
    await rm(path.join(root, 'back.png'));
    // Metadata validation is eager, image reading is lazy.
    await expect(samples[Symbol.asyncIterator]().next()).rejects.toThrow('sample_manifest_invalid');
    await writeFile(path.join(root, 'back.png'), new Uint8Array([1, 2, 3]), { mode: 0o600 });
    const reloaded = await loadAuthorizedSamples(env);
    if (Array.isArray(reloaded)) throw new Error('expected_v2_stream');
    const iterator = reloaded[Symbol.asyncIterator]();
    const first = await iterator.next();
    expect(Array.from(first.value.front.bytes)).toEqual([1, 2, 3]);
    await iterator.return();
    expect(first.value.front.bytes.every((byte: number) => byte === 0)).toBe(true);
    expect(first.value.back.bytes.every((byte: number) => byte === 0)).toBe(true);
  });
});
it('keeps name boundaries and punctuation while normalizing document separators', () => {
  expect(normalizeEvaluationField('holderName', '  A  B-É  ')).toBe('A B-É');
  expect(normalizeEvaluationField('holderName', 'ABÉ')).not.toBe(normalizeEvaluationField('holderName', 'A B-É'));
  expect(normalizeEvaluationField('documentNumber', '990101-14-0001')).toBe('990101140001');
});
it('makes bounded deterministic corruptions without changing the source or saving images', async () => {
  const bytes = new Uint8Array(await sharp({ create: { width: 100, height: 60, channels: 3, background: '#888888' } }).png().toBuffer());
  const image = { mimeType: 'image/png', bytes };
  const original = bytes.slice();
  for (const scenario of ['reference', 'jpeg-75', 'jpeg-40', 'width-900', 'blur-1', 'blur-2', 'rotate-4', 'rotate-minus-4', 'darken-070', 'glare-obscured', 'filter-normalise']) {
    const variant = await makeCorruptionVariant(image, scenario);
    expect(variant.bytes.byteLength).toBeGreaterThan(0);
    expect((await sharp(variant.bytes).metadata()).pages ?? 1).toBe(1);
    if (scenario === 'reference') expect(variant.bytes).toEqual(original);
    variant.bytes.fill(0); expect(bytes).toEqual(original);
  }
  const small = await makeCorruptionVariant(image, 'width-900');
  expect((await sharp(small.bytes).metadata()).width).toBe(100);
  await expect(makeCorruptionVariant(image, 'free-form')).rejects.toThrow('sample_transform_failed');
});
it('reports wrong names and failures in separate field denominators without exporting identifiers', async () => {
  await privateStudy(async ({ root, env }) => {
    const png = await sharp({ create: { width: 80, height: 40, channels: 3, background: '#fff' } }).png().toBuffer();
    for (const filename of ['front.png', 'back.png']) await writeFile(path.join(root, filename), png, { mode: 0o600 });
    let calls = 0;
    const report = await evaluateSamples(await loadAuthorizedSamples(env), async (input: Record<string, unknown>) => {
      expect(Object.keys(input).sort()).toEqual(['back', 'documentType', 'front']);
      return ++calls === 1 ? { ok: true, fields: { holderName: 'PRIVATEGOLD', documentNumber: '990101-14-0001' } } : { ok: false };
    });
    if (!('fields' in report)) throw new Error('expected_v2_report');
    expect(report.fields.holderName).toMatchObject({ denominator: 2, wrong: 1, engineErrors: 1, correct: 0, notRun: 0 });
    expect(report.fields.documentNumber).toMatchObject({ denominator: 2, correct: 1, engineErrors: 1 });
    expect(JSON.stringify(report)).not.toMatch(/PRIVATE GOLD|990101|caseId|personGroup|expected|manifest\.json/);
  });
});
it('counts unstarted cases as not-run when the execution budget is exhausted', async () => {
  await privateStudy(async ({ env }) => {
    const recognize = vi.fn();
    const report = await evaluateSamples(await loadAuthorizedSamples(env), recognize, { budgetMs: 1 });
    if (!('fields' in report)) throw new Error('expected_v2_report');
    expect(recognize).not.toHaveBeenCalled();
    expect(report.fields.documentNumber).toMatchObject({ denominator: 2, notRun: 2 });
    expect(report.latency).toMatchObject({ samples: 0, p95Ms: null });
  });
});
it('keeps transformation failures inside both field denominators and never calls OCR', async () => {
  await privateStudy(async ({ env }) => {
    const recognize = vi.fn();
    const report = await evaluateSamples(await loadAuthorizedSamples(env), recognize);
    if (!('fields' in report)) throw new Error('expected_v2_report');
    expect(recognize).not.toHaveBeenCalled();
    expect(report.fields.holderName).toMatchObject({ denominator: 2, transformErrors: 2, notRun: 0, accuracy: 0 });
  });
});
it('separates unsupported layouts and disputed truth without falsely treating them as OCR errors', async () => {
  await privateStudy(async ({ registry, manifest, env, save }) => {
    registry[0].layout = 'other-unsupported'; registry[1].truthStatus = 'disputed';
    manifest.cases = registry.map(row => ({ ...row, front: 'front.png', back: 'back.png', expectedHolderName: 'PRIVATE GOLD', expectedDocumentNumber: '990101140001', profile: null }));
    env.KYC_NODE_OCR_STUDY_SEAL = sealStudyRegistry(registry); await save();
    const recognize = vi.fn();
    const report = await evaluateSamples(await loadAuthorizedSamples(env), recognize);
    if (!('fields' in report)) throw new Error('expected_v2_report');
    expect(report.counts).toMatchObject({ eligible: 0, disputed: 1, unsupported: 1 });
    expect(report.fields.documentNumber.denominator).toBe(0); expect(recognize).not.toHaveBeenCalled();
  });
});
it('runs the real offline engine through a sealed synthetic corruption study', async () => {
  await privateStudy(async ({ root, registry, manifest, env, save }) => {
    for (const side of ['front', 'back'] as const) {
      const image = await prepareKycEvidenceImage(await sharp(fixtureSvg(side, 'NAMA CONTOH UJIAN', '990101-14-0001')).png().toBuffer(), 'image/png');
      await writeFile(path.join(root, `${side}.png`), image.stored, { mode: 0o600 });
    }
    for (const row of registry) row.source = 'public-mock';
    manifest.cases = registry.map(row => ({ ...row, front: 'front.png', back: 'back.png', expectedHolderName: 'NAMA CONTOH UJIAN', expectedDocumentNumber: '990101140001', profile: null }));
    manifest.scenario = 'jpeg-75'; env.KYC_NODE_OCR_STUDY_SEAL = sealStudyRegistry(registry); await save();
    const report = await evaluateSamples(await loadAuthorizedSamples(env), (input: Parameters<typeof extractKycFieldsInNode>[0]) => extractKycFieldsInNode(input, 20000));
    if (!('fields' in report)) throw new Error('expected_v2_report');
    expect(report.fields.documentNumber).toMatchObject({ correct: 2, denominator: 2 });
    expect(report.fields.holderName).toMatchObject({ correct: 2, denominator: 2 });
    expect(report.counts.variants).toBe(2);
  });
}, 60000);
it('streams passport front-only samples and aggregates MRZ/VIZ outcomes without identifiers', async () => {
  const root = await realpath(await mkdtemp(path.join(tmpdir(), 'kyc-passport-test-')));
  try {
    await chmod(root, 0o700);
    const image = await sharp({ create: { width: 160, height: 100, channels: 3, background: '#eeeeee' } }).png().toBuffer();
    await writeFile(path.join(root, 'passport-front.png'), image, { mode: 0o600 });
    const registry = [
      studyRow({ source: 'authorized-passport', layout: 'passport-biodata', documentType: 'passport', split: 'development' }),
      studyRow({ source: 'public-mock', layout: 'passport-biodata', documentType: 'passport', split: 'validation' }),
    ];
    const manifest = { schemaVersion: 2, protocolVersion: 'kyc-ocr-study-v2', registry, selection: registry.map(row => row.caseId), scenario: 'reference',
      cases: registry.map(row => ({ ...row, front: 'passport-front.png', expectedHolderName: 'PASSPORT SAMPLE', expectedDocumentNumber: 'E900000082', profile: null })) };
    const manifestPath = path.join(root, 'manifest.json');
    await writeFile(manifestPath, JSON.stringify(manifest), { mode: 0o600 });
    const samples = await loadAuthorizedSamples({ KYC_NODE_OCR_EVALUATION: '1', KYC_NODE_OCR_SAMPLE_MANIFEST: manifestPath,
      KYC_NODE_OCR_STUDY_SEAL: sealStudyRegistry(registry) });
    if (Array.isArray(samples)) throw new Error('expected_v2_stream');
    expect(samples.summary.images).toBe(2);
    let calls = 0;
    const report = await evaluateSamples(samples, async (input: Record<string, unknown>) => {
      expect(Object.keys(input).sort()).toEqual(['documentType', 'front']);
      calls += 1;
      return { ok: true, fields: calls === 1
        ? { holderName: 'PASSPORT SAMPLE', documentNumber: 'E900000082', mrzStatus: 'valid', visualComparisonStatus: 'incomplete', visualMissingFields: ['surname', 'given_names'] }
        : { holderName: 'PASSPORT SAMPLE', documentNumber: 'E900000082', mrzStatus: 'invalid', visualComparisonStatus: 'conflict', visualMismatchFields: ['document_number', 'expiry_date'] } };
    });
    if (!('fields' in report)) throw new Error('expected_v2_report');
    expect(report.counts).toMatchObject({ images: 2, eligible: 2, passportEligible: 2 });
    expect(report.fields).toMatchObject({ holderName: { correct: 2 }, documentNumber: { correct: 2 } });
    expect(report.passportChecks.mrz).toMatchObject({ denominator: 2, valid: 1, invalid: 1, notRun: 0 });
    expect(report.passportChecks.visualComparison).toMatchObject({ denominator: 2, incomplete: 1, conflict: 1,
      missingFields: 2, conflictingFields: 2, notRun: 0 });
    expect(report.passportChecks.mrz.totalMs).toBeGreaterThanOrEqual(0);
    expect(report.passportChecks.visualComparison.meanMs).toBeGreaterThanOrEqual(0);
    expect(JSON.stringify(report)).not.toMatch(/PASSPORT SAMPLE|E900000082|caseId|personGroup|manifest\.json/);
  } finally { await rm(root, { recursive: true, force: true }); }
});
it('rejects a passport manifest that declares a second evidence side', async () => {
  const root = await realpath(await mkdtemp(path.join(tmpdir(), 'kyc-passport-side-test-')));
  try {
    await chmod(root, 0o700);
    const registry = [studyRow({ source: 'public-mock', layout: 'passport-biodata', documentType: 'passport' })];
    const manifest = { schemaVersion: 2, protocolVersion: 'kyc-ocr-study-v2', registry, selection: [registry[0].caseId], scenario: 'reference',
      cases: [{ ...registry[0], front: 'passport-front.png', back: 'passport-back.png', expectedHolderName: 'PASSPORT SAMPLE', expectedDocumentNumber: 'E900000082', profile: null }] };
    const manifestPath = path.join(root, 'manifest.json');
    await writeFile(manifestPath, JSON.stringify(manifest), { mode: 0o600 });
    await expect(loadAuthorizedSamples({ KYC_NODE_OCR_EVALUATION: '1', KYC_NODE_OCR_SAMPLE_MANIFEST: manifestPath,
      KYC_NODE_OCR_STUDY_SEAL: sealStudyRegistry(registry) })).rejects.toThrow('sample_manifest_invalid');
  } finally { await rm(root, { recursive: true, force: true }); }
});
it('does not read any sample without explicit authorization', async () => {
  await expect(loadAuthorizedSamples({ KYC_NODE_OCR_SAMPLE_MANIFEST: '/not-readable' })).rejects.toThrow('sample_authorization_required');
});
it('loads only a private manually checked truth after explicit local opt-in', async () => {
  const root = await realpath(await mkdtemp(path.join(tmpdir(), 'kyc-truth-test-')));
  const filename = path.join(root, 'truth.json');
  try {
    await chmod(root, 0o700);
    await writeFile(filename, JSON.stringify({ schemaVersion: 1, truthStatus: 'single-checked', holderName: 'Fictional Á Name', documentNumber: '990101-14-0001' }), { mode: 0o600 });
    const env: Record<string, string | undefined> = { KYC_NODE_OCR_EVALUATION: '1', KYC_NODE_OCR_TRUTH_MANIFEST: filename };
    await expect(loadPrivateStudyTruth({ ...env, KYC_NODE_OCR_EVALUATION: '0' })).rejects.toThrow('private_study_truth_authorization_required');
    await expect(loadPrivateStudyTruth(env)).resolves.toEqual({ schemaVersion: 1, truthStatus: 'single-checked', holderName: 'Fictional Á Name', documentNumber: '990101140001' });
    await writeFile(filename, JSON.stringify({ schemaVersion: 1, truthStatus: 'double-checked', holderName: 'PRIVATE CONTENT', documentNumber: '990101140001', extra: true }), { mode: 0o600 });
    await expect(loadPrivateStudyTruth(env)).rejects.toThrow('private_study_truth_invalid');
  } finally { await rm(root, { recursive: true, force: true }); }
});
it('rejects samples outside the private root before opening images', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'kyc-eval-test-'));
  try {
    await chmod(root, 0o700);
    await writeFile(path.join(root, 'manifest.json'), JSON.stringify({ cases: [{ front: '../escape.png', back: 'back.png', documentType: 'national_id', expectedHolderName: 'SYNTHETIC', expectedDocumentNumber: '990101140001', group: 'assisted', stage: 'initial' }] }), { mode: 0o600 });
    await expect(loadAuthorizedSamples({ KYC_NODE_OCR_EVALUATION: '1', KYC_NODE_OCR_SAMPLE_MANIFEST: path.join(root, 'manifest.json') })).rejects.toThrow('sample_manifest_invalid');
  } finally { await rm(root, { recursive: true, force: true }); }
});
it('loads only the declared private sample files after complete manifest validation', async () => {
  const root = await realpath(await mkdtemp(path.join(tmpdir(), 'kyc-valid-eval-test-')));
  try {
    await chmod(root, 0o700);
    for (const file of ['front.png', 'back.png']) await writeFile(path.join(root, file), new Uint8Array([1, 2, 3]), { mode: 0o600 });
    await writeFile(path.join(root, 'manifest.json'), JSON.stringify({ cases: [{ front: 'front.png', back: 'back.png', documentType: 'national_id', expectedHolderName: 'SYNTHETIC', expectedDocumentNumber: '990101140001', group: 'assisted', stage: 'initial' }] }), { mode: 0o600 });
    const samples = await loadAuthorizedSamples({ KYC_NODE_OCR_EVALUATION: '1', KYC_NODE_OCR_SAMPLE_MANIFEST: path.join(root, 'manifest.json') });
    if (!Array.isArray(samples)) throw new Error('expected_legacy_array');
    expect(samples).toHaveLength(1); expect(samples[0].front.bytes.byteLength).toBe(3);
    for (const item of samples) { item.front.bytes.fill(0); item.back.bytes.fill(0); }
  } finally { await rm(root, { recursive: true, force: true }); }
});
it('emits only aggregate booleans/counts for sensitive extracted fields', async () => {
  const output = await evaluateSamples([{ documentType: 'national_id', expectedHolderName: 'SYNTHETIC', expectedDocumentNumber: '990101140001', front: { mimeType: 'image/png', bytes: new Uint8Array([1]) }, back: { mimeType: 'image/png', bytes: new Uint8Array([1]) } }], async () => ({ ok: true, fields: { holderName: 'SYNTHETIC', documentNumber: '990101140001' } }));
  expect(output).toMatchObject({ samples: 1, numberExact: 1, nameExact: 1 });
  expect(output).toMatchObject({ schemaVersion: 1, kind: 'legacy_exploratory_field_evaluation' });
  expect(JSON.stringify(output)).not.toMatch(/SYNTHETIC|990101|front|expected/);
});
it.skipIf(process.env.KYC_NODE_OCR_EVALUATION !== '1')('runs separately authorized local samples without exporting identity content', async () => {
  const samples = await loadAuthorizedSamples(process.env);
  try { console.log(JSON.stringify(await evaluateSamples(samples, (input: Parameters<typeof extractKycFieldsInNode>[0]) => extractKycFieldsInNode(input, 20000)))); }
  catch { throw new Error('authorized_sample_evaluation_failed'); }
  finally { if (Array.isArray(samples)) for (const sample of samples) { sample.front.bytes.fill(0); sample.back?.bytes.fill(0); } }
}, 420000);
