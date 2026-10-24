import { expect, it } from 'vitest';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import { fieldTuningConditions, fieldTuningInputs, makeStudyVariant, runAndSummarizeFieldTuningStudy, runOwnedFieldTuningStudy, runOwnedStudy, summarizeFieldTuning, summarizeStudy } from '../lib/kyc-single-sample-study.mjs';

it('adds repeatable bounded Gaussian noise without mutating the input', async () => {
  const bytes = await sharp({ create: { width: 100, height: 60, channels: 3, background: '#808080' } }).png().toBuffer();
  const original = Buffer.from(bytes);
  const image = { bytes, mimeType: 'image/png' };
  const light = await makeStudyVariant(image, 'noise-gaussian-10');
  const repeat = await makeStudyVariant(image, 'noise-gaussian-10');
  const heavy = await makeStudyVariant(image, 'noise-gaussian-25');
  expect(light.bytes).toEqual(repeat.bytes);
  expect(light.bytes).not.toEqual(heavy.bytes);
  expect(light.bytes).not.toEqual(bytes);
  expect(bytes).toEqual(original);
  expect(light.mimeType).toBe('image/jpeg');
  expect(light.bytes.length).toBeLessThanOrEqual(5 * 1024 * 1024);
  for (const result of [light, repeat, heavy]) result.bytes.fill(0);
});
it('makes nonuniform illumination, fixed salt noise and filters with unchanged image dimensions', async () => {
  const bytes = await sharp({ create: { width: 100, height: 60, channels: 3, background: '#808080' } }).png().toBuffer();
  const gradient = await makeStudyVariant({ bytes, mimeType: 'image/png' }, 'light-gradient');
  const raw = await sharp(gradient.bytes).raw().toBuffer();
  expect(raw[0]).toBeLessThan(raw[(99 * 3)] - 60);
  for (const scenario of ['noise-salt-010', 'noise-salt-030', 'light-overexposed', 'shadow-left', 'filter-median-3', 'filter-sharpen-1', 'noise-gaussian-25-median-3', 'noise-gaussian-25-normalise']) {
    const output = await makeStudyVariant({ bytes, mimeType: 'image/png' }, scenario);
    const metadata = await sharp(output.bytes).metadata();
    expect([metadata.width, metadata.height]).toEqual([100, 60]);
    output.bytes.fill(0);
  }
  await expect(makeStudyVariant({ bytes, mimeType: 'image/jpeg' }, 'light-gradient')).rejects.toThrow('study_transform_failed');
  await expect(makeStudyVariant({ bytes: Buffer.alloc(5 * 1024 * 1024 + 1), mimeType: 'image/png' }, 'noise-gaussian-10')).rejects.toThrow('study_transform_failed');
  gradient.bytes.fill(0); raw.fill(0); bytes.fill(0);
});
it('keeps unavailable references and changed outputs distinct without reporting identity content or accuracy', () => {
  const baseline = { holderName: null, documentNumber: '990101140001' };
  const crop = { holderName: 'FICTIONAL PERSON', documentNumber: '990101140001' };
  const rows = [
    { scenario: 'provided', pair: baseline, crop, outcome: 'ready', elapsedMs: 10 },
    { scenario: 'reference', pair: { holderName: 'FICTIONAL PERSON', documentNumber: '990101140002' }, crop, outcome: 'ready', elapsedMs: 10 },
    { scenario: 'blur-1', pair: null, crop: null, outcome: 'transform-error', elapsedMs: 1 },
  ];
  const report = summarizeStudy(rows);
  expect(report.conditions[0].pair.holderName.comparison).toBe('unknown');
  expect(report.conditions[1].pair.holderName.comparison).toBe('no-reference');
  expect(report.conditions[1].pair.documentNumber.comparison).toBe('changed');
  expect(report.conditions[1].crop.holderName.comparison).toBe('same');
  expect(report.totals.pair).toMatchObject({ planned: 6, available: 3, unknown: 1, notRun: 2 });
  expect(JSON.stringify(report)).not.toMatch(/FICTIONAL|990101|holderNameValue|correct|accuracyRate/);
});
it('counts whole-row and individual-channel not-run states without turning them into unknown fields', () => {
  const fields = { holderName: 'FICTIONAL PERSON', documentNumber: '990101140001' };
  const report = summarizeStudy([
    { scenario: 'provided', pair: fields, crop: fields, outcome: 'ready', pairOutcome: 'ready', cropOutcome: 'ready', elapsedMs: 1 },
    { scenario: 'reference', pair: null, crop: fields, outcome: 'ready', pairOutcome: 'not-run', cropOutcome: 'ready', elapsedMs: 0 },
    { scenario: 'blur-1', pair: null, crop: null, outcome: 'not-run', pairOutcome: 'not-run', cropOutcome: 'not-run', elapsedMs: 0 },
  ]);
  expect(report.conditions[1].pair.holderName).toEqual({ available: false, comparison: 'not-run' });
  expect(report.conditions[1].crop.holderName).toEqual({ available: true, comparison: 'same' });
  expect(report.totals.pair).toMatchObject({ planned: 6, available: 2, notRun: 4, unknown: 0 });
  expect(report.totals.crop).toMatchObject({ planned: 6, available: 4, notRun: 2, unknown: 0 });
  expect(JSON.stringify(report)).not.toMatch(/FICTIONAL|990101/);
});
it('projects the fixed tuning matrix to exact field denominators and uses consistency-only without verified truth', () => {
  const rows: Array<{ condition: string; input: string; outcome: 'ready'; elapsedMs: number; fields: { holderName: string | null; documentNumber: string | null } }> = fieldTuningConditions.flatMap(condition => fieldTuningInputs.map(input => ({ condition, input, outcome: 'ready', elapsedMs: 0, fields: {
    holderName: condition === 'C1' ? 'FICTIONAL PERSON' : null,
    documentNumber: condition === 'C1' ? '990101-14-0001' : null,
  } })));
  const truth = { schemaVersion: 1, truthStatus: 'single-checked', holderName: 'FICTIONAL PERSON', documentNumber: '990101140001' } as const;
  const scored = summarizeFieldTuning(rows, truth);
  const c1 = scored.conditions.find(row => row.condition === 'C1');
  expect(scored.mode).toBe('reference-match');
  expect(c1?.fields.holderName).toMatchObject({ planned: 2, referenceMatches: 2, referenceMismatches: 0, unknown: 0 });
  expect(c1?.fields.documentNumber).toMatchObject({ planned: 2, referenceMatches: 2, referenceMismatches: 0, unknown: 0 });
  expect(scored.conditions.find(row => row.condition === 'C4')?.fields.documentNumber).toMatchObject({ planned: 2, notApplicable: 2 });
  const consistency = summarizeFieldTuning(rows);
  expect(consistency).toMatchObject({ mode: 'consistency-only', truthStatus: 'not-supplied' });
  expect(scored.accuracyUnmeasured).toBe(true);
  expect(consistency.conditions.find(row => row.condition === 'C1')?.fields.holderName).toMatchObject({ sameAsBaseline: 0, noReference: 2 });
  expect(JSON.stringify({ scored, consistency })).not.toMatch(/FICTIONAL|990101/);
  expect(() => summarizeFieldTuning(rows.slice(1), truth)).toThrow('study_invalid_result');
});
it('times out, waits for a SIGTERM-resistant owned child to exit and clears the sent image', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'kyc-study-test-'));
  const imageBytes = Buffer.from([1, 2, 3]);
  try {
    const childFile = path.join(root, 'hang.mjs');
    await fs.writeFile(childFile, "process.on('SIGTERM',()=>{});process.on('message',()=>{});setInterval(()=>{},1000);", { mode: 0o600 });
    const before = performance.now();
    await expect(runOwnedStudy({ imageBytes, childFile, timeoutMs: 250, graceMs: 100 })).rejects.toThrow('study_timeout');
    expect(performance.now() - before).toBeLessThan(4000);
    expect([...imageBytes]).toEqual([0, 0, 0]);
  } finally { await fs.rm(root, { recursive: true, force: true }); }
});
it('preserves completed field-tuning rows and marks the remainder not-run after its deadline', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'kyc-study-test-'));
  const imageBytes = Buffer.from([1, 2, 3]);
  try {
    const childFile = path.join(root, 'partial.mjs');
    await fs.writeFile(childFile, "process.on('SIGTERM',()=>{});process.on('message',()=>{process.send({kind:'field-tuning-row-v1',row:{condition:'W0',input:'provided',outcome:'ready',elapsedMs:1,fields:{holderName:'SYNTHETIC',documentNumber:null}}});setInterval(()=>{},1000)});", { mode: 0o600 });
    const result = await runOwnedFieldTuningStudy({ imageBytes, childFile, timeoutMs: 250, graceMs: 100 });
    expect(result.timedOut).toBe(true);
    expect(result.rows.find(row => row.condition === 'W0' && row.input === 'provided')?.outcome).toBe('ready');
    expect(result.rows.filter(row => row.outcome === 'not-run')).toHaveLength(11);
    expect([...imageBytes]).toEqual([0, 0, 0]);
  } finally { await fs.rm(root, { recursive: true, force: true }); }
});
it('returns only a projection from the preferred field-tuning entry point and clears raw rows', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'kyc-study-test-'));
  const imageBytes = Buffer.from([1, 2, 3]);
  try {
    const childFile = path.join(root, 'projection.mjs');
    const conditions = JSON.stringify(fieldTuningConditions);
    const inputs = JSON.stringify(fieldTuningInputs);
    const childSource = `process.on('message',()=>{const conditions=${conditions};const inputs=${inputs};const rows=[];for(const condition of conditions)for(const input of inputs)rows.push({condition,input,outcome:'not-run',elapsedMs:0,fields:{holderName:null,documentNumber:null}});rows[0]={condition:'W0',input:'provided',outcome:'ready',elapsedMs:1,fields:{holderName:'SENSITIVE SYNTHETIC NAME',documentNumber:'990101140001'}};process.send({kind:'field-tuning-raw-v1',timedOut:false,rows},()=>process.exit(0));});`;
    await fs.writeFile(childFile, childSource, { mode: 0o600 });
    const report = await runAndSummarizeFieldTuningStudy({ imageBytes, childFile, truth: { schemaVersion: 1, truthStatus: 'double-checked', holderName: 'SENSITIVE SYNTHETIC NAME', documentNumber: '990101140001' } });
    expect(report).toMatchObject({ kind: 'field-tuning-summary-v1', mode: 'reference-match', accuracyUnmeasured: false, timedOut: false });
    expect(report.conditions[0].fields.holderName.correct).toBe(1);
    expect(JSON.stringify(report)).not.toMatch(/SENSITIVE|990101140001/);
    expect([...imageBytes]).toEqual([0, 0, 0]);
  } finally { await fs.rm(root, { recursive: true, force: true }); }
});
it('does not return arbitrary child messages and clears the source even on invalid output', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'kyc-study-test-'));
  const imageBytes = Buffer.from([1, 2, 3]);
  try {
    const childFile = path.join(root, 'bad.mjs');
    await fs.writeFile(childFile, "process.on('message',()=>process.send({secret:'FICTIONAL PRIVATE'},()=>process.exit(0)));", { mode: 0o600 });
    await expect(runOwnedStudy({ imageBytes, childFile, timeoutMs: 2000 })).rejects.toThrow('study_invalid_result');
    expect([...imageBytes]).toEqual([0, 0, 0]);
  } finally { await fs.rm(root, { recursive: true, force: true }); }
});

it('maps expanded rotation bounds before recognizing any diagnostic crop', async () => {
  const { mapStudyCrop } = await import('../lib/kyc-single-sample-study.mjs');
  const width = 563, height = 356;
  const source = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><rect width="100%" height="100%" fill="white"/><rect x="30" y="60" width="40" height="30" fill="red"/></svg>`);
  for (const angle of [4, -4]) {
    const { data, info } = await sharp(source).rotate(angle, { background: '#ffffff' }).removeAlpha().raw().toBuffer({ resolveWithObject: true });
    const box = mapStudyCrop([30, 60, 70, 90], width, height, info.width, info.height, angle);
    let total = 0, inside = 0;
    for (let y = 0; y < info.height; y += 1) for (let x = 0; x < info.width; x += 1) {
      const offset = (y * info.width + x) * info.channels;
      if (data[offset] > 200 && data[offset + 1] < 50 && data[offset + 2] < 50) {
        total += 1;
        if (x >= box.left && x < box.left + box.width && y >= box.top && y < box.top + box.height) inside += 1;
      }
    }
    expect(total).toBeGreaterThan(1000);
    expect(inside / total).toBeGreaterThanOrEqual(0.99);
    data.fill(0);
  }
  expect(mapStudyCrop([30, 60, 70, 90], 563, 356, 300, 190)).toEqual({ left: 15, top: 32, width: 23, height: 17 });
});
it('exits the real study process when its owner disconnects during model initialization', async () => {
  const { fork } = await import('node:child_process');
  const { fileURLToPath } = await import('node:url');
  const imageBytes = await sharp({ create: { width: 563, height: 727, channels: 3, background: '#eeeeee' } }).png().toBuffer();
  const child = fork(fileURLToPath(new URL('../lib/kyc-single-sample-study.mjs', import.meta.url)), ['--study-child'], { execArgv: [], env: { NODE_ENV: 'production' }, stdio: ['ignore', 'ignore', 'ignore', 'ipc'], serialization: 'advanced' });
  try {
    const closed = new Promise<number | null>(resolve => child.once('exit', resolve));
    child.send({ imageBytes });
    await new Promise(resolve => setTimeout(resolve, 200));
    child.disconnect();
    const timer = setTimeout(() => child.kill('SIGKILL'), 2000);
    const code = await closed;
    clearTimeout(timer);
    expect(code).toBe(1);
  } finally { imageBytes.fill(0); if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL'); }
});

it('runs the fixed local models through all synthetic conditions and returns aggregate-safe projections', async () => {
  const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="563" height="727"><rect width="563" height="727" fill="white"/><g font-family="sans-serif" font-size="22" fill="black"><text x="20" y="45">NAMA</text><text x="20" y="80">SYNTHETIC PERSON</text><text x="20" y="120">990101-14-0001</text><text x="20" y="460">SYNTHETIC BACK</text><text x="20" y="510">990101-14-0001</text></g></svg>');
  const imageBytes = await sharp(svg).png().toBuffer();
  try {
    const result = await runOwnedStudy({ imageBytes });
    expect(result.rows[0].pair.documentNumber).toBe('990101140001');
    const report = summarizeStudy(result.rows);
    expect(report.conditions).toHaveLength(20);
    expect(report.totals.pair.planned).toBe(40);
    expect(report.totals.crop.planned).toBe(40);
    expect(imageBytes.every((value: number) => value === 0)).toBe(true);
    expect(JSON.stringify(report)).not.toMatch(/SYNTHETIC PERSON|990101140001/);
  } finally { svg.fill(0); imageBytes.fill(0); }
}, 120000);

it('runs the bounded fixed field-tuning matrix in one offline worker and clears its input', async () => {
  const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="563" height="727"><rect width="563" height="727" fill="white"/><g font-family="sans-serif" font-size="24" fill="black"><text x="20" y="100">990101-14-0001</text><text x="20" y="175">NAME:</text><text x="20" y="235">SYNTHETIC PERSON</text><text x="20" y="475">990101-14-0001</text></g></svg>');
  const imageBytes = await sharp(svg).png().toBuffer();
  try {
    const raw = await runOwnedFieldTuningStudy({ imageBytes });
    expect(raw.rows).toHaveLength(12);
    expect(raw.rows.every(row => ['ready', 'engine-error', 'transform-error', 'not-run'].includes(row.outcome))).toBe(true);
    const report = summarizeFieldTuning(raw.rows, { schemaVersion: 1, truthStatus: 'single-checked', holderName: 'SYNTHETIC PERSON', documentNumber: '990101140001' });
    expect(report.conditions).toHaveLength(6);
    expect(report.accuracyUnmeasured).toBe(true);
    expect(report.conditions.find(row => row.condition === 'C4')?.fields.documentNumber.notApplicable).toBe(2);
    expect(JSON.stringify(report)).not.toMatch(/SYNTHETIC|990101/);
    expect(imageBytes.every(value => value === 0)).toBe(true);
  } finally { svg.fill(0); imageBytes.fill(0); }
}, 120000);
