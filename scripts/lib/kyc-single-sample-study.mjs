/** Authorized local exploration only. Never imports app configuration or persists identity content. */
import { fork } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { normalizeEvaluationField } from './kyc-node-ocr-evaluation.mjs';

const require = createRequire(import.meta.url);
const maximumBytes = 5 * 1024 * 1024;
const fields = ['holderName', 'documentNumber'];
/** @typedef {{ schemaVersion: 1, truthStatus: 'single-checked' | 'double-checked' | 'disputed', holderName: string, documentNumber: string }} FieldTuningTruth */
/** @typedef {{ condition: string, input: string, outcome: 'ready' | 'engine-error' | 'transform-error' | 'not-run', elapsedMs: number, fields: { holderName: string | null, documentNumber: string | null } }} FieldTuningRow */
/** @typedef {{ [key: string]: number }} FieldTuningCounts */
/** @typedef {{ kind: 'field-tuning-summary-v1', truthStatus: string, mode: 'consistency-only' | 'reference-match', accuracyUnmeasured: boolean, timedOut?: boolean, conditions: Array<{ condition: string, elapsedMs: number, fields: Record<'holderName' | 'documentNumber', FieldTuningCounts> }> }} FieldTuningSummary */
export const studyConditions = ['provided', 'reference', 'blur-1', 'blur-2', 'noise-gaussian-10', 'noise-gaussian-25',
  'noise-salt-010', 'noise-salt-030', 'light-gradient', 'light-overexposed', 'shadow-left', 'rotate-4', 'rotate-minus-4',
  'jpeg-40', 'width-300', 'filter-normalise', 'filter-median-3', 'filter-sharpen-1', 'noise-gaussian-25-median-3', 'noise-gaussian-25-normalise'];
export const fieldTuningConditions = ['W0', 'C0', 'C1', 'C2', 'C3', 'C4'];
export const fieldTuningInputs = ['provided', 'reference'];
const existingConditions = ['reference', 'blur-1', 'blur-2', 'rotate-4', 'rotate-minus-4', 'jpeg-40', 'filter-normalise'];
const imageOptions = { limitInputPixels: 20_000_000, failOn: 'error' };

/** New conditions use one fixed seed/encoding; no adaptive quality or best-of selection. */
export async function makeStudyVariant(image, scenario) {
  let raw, encoded;
  try {
    if (!studyConditions.includes(scenario) || !(image?.bytes instanceof Uint8Array) || !image.bytes.length || image.bytes.length > maximumBytes) throw new Error();
    if (existingConditions.includes(scenario)) {
      const { makeCorruptionVariant } = await import('./kyc-node-ocr-evaluation.mjs');
      return await makeCorruptionVariant(image, scenario);
    }
    const { default: sharp } = await import('sharp');
    const metadata = await sharp(image.bytes, imageOptions).timeout({ seconds: 5 }).metadata();
    if ({ png: 'image/png', jpeg: 'image/jpeg', webp: 'image/webp' }[metadata.format] !== image.mimeType ||
      (metadata.pages ?? 1) !== 1 || !metadata.width || !metadata.height || metadata.width * metadata.height > 20_000_000) throw new Error();
    if (scenario === 'provided') return { mimeType: image.mimeType, bytes: Buffer.from(image.bytes) };
    const decoded = await sharp(image.bytes, imageOptions).timeout({ seconds: 5 }).removeAlpha().toColourspace('srgb').raw().toBuffer({ resolveWithObject: true });
    raw = decoded.data;
    const { width, height, channels } = decoded.info;
    let state = 20261024;
    const random = () => {
      state ^= state << 13; state ^= state >>> 17; state ^= state << 5;
      return ((state >>> 0) + 0.5) / 4294967296;
    };
    const gaussian = () => Math.sqrt(-2 * Math.log(random())) * Math.cos(2 * Math.PI * random());
    for (let y = 0; y < height; y += 1) for (let x = 0; x < width; x += 1) {
      const offset = (y * width + x) * channels;
      const salt = scenario.startsWith('noise-salt-') && random() < (scenario.endsWith('010') ? 0.01 : 0.03) ? (random() < 0.5 ? 0 : 255) : null;
      for (let channel = 0; channel < channels; channel += 1) {
        let value = raw[offset + channel];
        if (scenario.startsWith('noise-gaussian-')) value += gaussian() * (scenario === 'noise-gaussian-10' ? 10 : 25);
        if (salt !== null) value = salt;
        const fraction = width > 1 ? x / (width - 1) : 0;
        if (scenario === 'light-gradient') value *= 0.35 + 0.65 * fraction;
        if (scenario === 'light-overexposed') value *= 0.6 + 0.9 * fraction;
        if (scenario === 'shadow-left' && x < width / 2) value *= 0.4;
        raw[offset + channel] = Math.max(0, Math.min(255, Math.round(value)));
      }
    }
    let pipeline = sharp(raw, { raw: { width, height, channels }, ...imageOptions }).timeout({ seconds: 5 });
    if (scenario === 'width-300') pipeline = pipeline.resize({ width: 300, withoutEnlargement: true });
    if (scenario.endsWith('median-3')) pipeline = pipeline.median(3);
    if (scenario === 'filter-sharpen-1') pipeline = pipeline.sharpen({ sigma: 1 });
    if (scenario === 'noise-gaussian-25-normalise') pipeline = pipeline.greyscale().normalise();
    const result = await pipeline.jpeg({ quality: 90, chromaSubsampling: '4:2:0' }).toBuffer({ resolveWithObject: true });
    encoded = result.data;
    if (encoded.length > maximumBytes || result.info.width * result.info.height > 20_000_000) throw new Error();
    const bytes = encoded; encoded = null;
    return { mimeType: 'image/jpeg', bytes };
  } catch { throw new Error('study_transform_failed'); }
  finally { raw?.fill(0); encoded?.fill(0); }
}

export function mapStudyCrop(box, width, height, outputWidth, outputHeight, degrees = 0) {
  const angle = degrees * Math.PI / 180;
  const points = [[box[0], box[1]], [box[2], box[1]], [box[2], box[3]], [box[0], box[3]]].map(([x, y]) => {
    const dx = x - width / 2, dy = y - height / 2;
    return [dx * Math.cos(angle) - dy * Math.sin(angle) + outputWidth / 2,
      dx * Math.sin(angle) + dy * Math.cos(angle) + outputHeight / 2];
  });
  const scaleX = degrees ? 1 : outputWidth / width, scaleY = degrees ? 1 : outputHeight / height;
  const xs = degrees ? points.map(p => p[0]) : [box[0] * scaleX, box[2] * scaleX];
  const ys = degrees ? points.map(p => p[1]) : [box[1] * scaleY, box[3] * scaleY];
  const left = Math.max(0, Math.floor(Math.min(...xs))), top = Math.max(0, Math.floor(Math.min(...ys)));
  const right = Math.min(outputWidth, Math.ceil(Math.max(...xs))), bottom = Math.min(outputHeight, Math.ceil(Math.max(...ys)));
  if (right <= left || bottom <= top) throw new Error('study_geometry_invalid');
  return { left, top, width: right - left, height: bottom - top };
}

/** Pure projection: empty baselines never count as evidence of a correct match. */
export function summarizeStudy(rows) {
  const baseline = rows.find(row => row.scenario === 'provided');
  if (!baseline) throw new Error('study_invalid_result');
  const totals = Object.fromEntries(['pair', 'crop'].map(channel => [channel, { planned: rows.length * 2, available: 0, unknown: 0, engineErrors: 0, notRun: 0, same: 0, changed: 0, noReference: 0 }]));
  const conditions = rows.map(row => {
    const projected = { scenario: row.scenario, elapsedMs: Math.round(row.elapsedMs), images: (row.images ?? []).map(image => ({ bytes: image.bytes, width: image.width, height: image.height, mimeType: image.mimeType })) };
    for (const channel of ['pair', 'crop']) {
      projected[channel] = {};
      for (const field of fields) {
        const value = row[channel]?.[field], reference = baseline[channel]?.[field];
        let comparison;
        if (row.outcome === 'transform-error' || row.outcome === 'not-run' || row[`${channel}Outcome`] === 'not-run') { comparison = 'not-run'; totals[channel].notRun += 1; }
        else if ((row[`${channel}Outcome`] ?? row.outcome) === 'engine-error') { comparison = 'error'; totals[channel].engineErrors += 1; }
        else if (typeof value !== 'string' || !value.trim()) { comparison = 'unknown'; totals[channel].unknown += 1; }
        else {
          totals[channel].available += 1;
          comparison = typeof reference !== 'string' || !reference.trim() ? 'no-reference' : normalizeEvaluationField(field, value) === normalizeEvaluationField(field, reference) ? 'same' : 'changed';
          totals[channel][comparison === 'no-reference' ? 'noReference' : comparison] += 1;
        }
        projected[channel][field] = { available: typeof value === 'string' && Boolean(value.trim()) && !['error', 'not-run'].includes(comparison), comparison };
      }
    }
    return projected;
  });
  for (const count of Object.values(totals)) {
    if (count.planned !== count.available + count.unknown + count.engineErrors + count.notRun || count.available !== count.same + count.changed + count.noReference) throw new Error('study_invalid_result');
  }
  return { conditions, totals };
}

/** Parent-only projection for the frozen tuning matrix; never returns observed or truth values. */
/** @param {FieldTuningRow[]} rows @param {FieldTuningTruth | null} [truth] @returns {FieldTuningSummary} */
export function summarizeFieldTuning(rows, truth = null) {
  if (truth !== null && truth !== undefined && (!truth || truth.schemaVersion !== 1 ||
    !['single-checked', 'double-checked', 'disputed'].includes(truth.truthStatus) ||
    typeof truth.holderName !== 'string' || truth.holderName.length > 160 || typeof truth.documentNumber !== 'string' || truth.documentNumber.length > 40)) throw new Error('study_invalid_result');
  const scoredTruth = truth && ['single-checked', 'double-checked'].includes(truth.truthStatus) ? truth : null;
  const consistencyOnly = !scoredTruth;
  const expectedRows = fieldTuningConditions.flatMap(condition => fieldTuningInputs.map(input => `${condition}:${input}`));
  if (!Array.isArray(rows) || rows.length !== expectedRows.length || rows.some(row => !row ||
    !fieldTuningConditions.includes(row.condition) || !fieldTuningInputs.includes(row.input) ||
    !['ready', 'engine-error', 'transform-error', 'not-run'].includes(row.outcome) || !Number.isFinite(row.elapsedMs) || row.elapsedMs < 0 || row.elapsedMs > 120000 ||
    !row.fields || Object.keys(row.fields).some(field => !fields.includes(field)) ||
    fields.some(field => row.fields[field] !== null && (typeof row.fields[field] !== 'string' || row.fields[field].length > 512)))) throw new Error('study_invalid_result');
  const keyed = new Map(rows.map(row => [`${row.condition}:${row.input}`, row]));
  if (expectedRows.some(key => !keyed.has(key)) || keyed.size !== expectedRows.length) throw new Error('study_invalid_result');
  const baseline = new Map(fieldTuningInputs.map(input => [input, keyed.get(`W0:${input}`)]));
  const conditions = fieldTuningConditions.map(condition => {
    const conditionRows = fieldTuningInputs.map(input => keyed.get(`${condition}:${input}`));
    const summary = { condition, elapsedMs: conditionRows.reduce((sum, row) => sum + row.elapsedMs, 0), fields: {} };
    for (const field of fields) {
      const counts = { planned: 2, ...(scoredTruth?.truthStatus === 'single-checked' ? { referenceMatches: 0, referenceMismatches: 0 } : { correct: 0, wrong: 0 }),
        unknown: 0, engineError: 0, transformError: 0, notRun: 0, notApplicable: 0,
        available: 0, sameAsBaseline: 0, changedFromBaseline: 0, noReference: 0 };
      for (const input of fieldTuningInputs) {
        const row = keyed.get(`${condition}:${input}`);
        if (condition === 'C4' && field === 'documentNumber') { counts.notApplicable += 1; continue; }
        if (row.outcome === 'engine-error') { counts.engineError += 1; continue; }
        if (row.outcome === 'transform-error') { counts.transformError += 1; continue; }
        if (row.outcome === 'not-run') { counts.notRun += 1; continue; }
        const actual = row.fields[field];
        if (typeof actual !== 'string' || !actual.trim()) { counts.unknown += 1; continue; }
        counts.available += 1;
        if (scoredTruth) {
          const expected = scoredTruth[field];
          if (typeof expected !== 'string' || !expected.trim()) counts.unknown += 1;
          else if (normalizeEvaluationField(field, actual) === normalizeEvaluationField(field, expected)) {
            if (scoredTruth.truthStatus === 'single-checked') counts.referenceMatches += 1;
            else counts.correct += 1;
          } else if (scoredTruth.truthStatus === 'single-checked') counts.referenceMismatches += 1;
          else counts.wrong += 1;
        } else {
          const reference = baseline.get(input)?.fields?.[field];
          if (typeof reference !== 'string' || !reference.trim()) counts.noReference += 1;
          else if (normalizeEvaluationField(field, actual) === normalizeEvaluationField(field, reference)) counts.sameAsBaseline += 1;
          else counts.changedFromBaseline += 1;
        }
      }
      if (scoredTruth && scoredTruth.truthStatus === 'single-checked' && counts.planned !== counts.referenceMatches + counts.referenceMismatches + counts.unknown + counts.engineError + counts.transformError + counts.notRun + counts.notApplicable) throw new Error('study_invalid_result');
      if (scoredTruth && scoredTruth.truthStatus === 'double-checked' && counts.planned !== counts.correct + counts.wrong + counts.unknown + counts.engineError + counts.transformError + counts.notRun + counts.notApplicable) throw new Error('study_invalid_result');
      if (!scoredTruth && counts.planned !== counts.available + counts.unknown + counts.engineError + counts.transformError + counts.notRun + counts.notApplicable) throw new Error('study_invalid_result');
      summary.fields[field] = counts;
    }
    return summary;
  });
  return { kind: 'field-tuning-summary-v1', truthStatus: scoredTruth?.truthStatus ?? truth?.truthStatus ?? 'not-supplied',
    mode: consistencyOnly ? 'consistency-only' : 'reference-match', accuracyUnmeasured: !scoredTruth || scoredTruth.truthStatus !== 'double-checked', conditions };
}

function validRawResult(result) {
  if (!result || result.kind !== 'single-sample-raw-v1' || !Array.isArray(result.rows) || result.rows.length !== studyConditions.length || Buffer.byteLength(JSON.stringify(result)) > 65536) return false;
  return result.rows.every((row, index) => row.scenario === studyConditions[index] && ['ready', 'transform-error'].includes(row.outcome) &&
    ['ready', 'engine-error', 'not-run'].includes(row.pairOutcome) && ['ready', 'engine-error', 'not-run'].includes(row.cropOutcome) &&
    Number.isFinite(row.elapsedMs) && row.elapsedMs >= 0 && row.elapsedMs <= 120000 && Array.isArray(row.images) && row.images.length <= 2 &&
    row.images.every(image => Number.isSafeInteger(image.bytes) && image.bytes > 0 && image.bytes <= maximumBytes && Number.isSafeInteger(image.width) && image.width > 0 && Number.isSafeInteger(image.height) && image.height > 0 && image.width * image.height <= 20_000_000 && ['image/png', 'image/jpeg', 'image/webp'].includes(image.mimeType)) &&
    ['pair', 'crop'].every(channel => row[channel] === null || (row[channel] && fields.every(field => row[channel][field] === null || (typeof row[channel][field] === 'string' && row[channel][field].length <= 512)))));
}

/** With all stdio ignored, exit proves termination; close also handles spawn failures. */
export async function runOwnedStudy({ imageBytes, timeoutMs = 120000, graceMs = 1000, childFile = fileURLToPath(import.meta.url) }) {
  if (!(imageBytes instanceof Uint8Array) || !imageBytes.length || imageBytes.length > maximumBytes || !Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 120000 || !Number.isSafeInteger(graceMs) || graceMs < 1 || graceMs > 2000) throw new Error('study_invalid_input');
  try {
    return await new Promise((resolve, reject) => {
      const child = fork(childFile, ['--study-child'], { cwd: process.cwd(), execArgv: [], env: { NODE_ENV: 'production' }, serialization: 'advanced', stdio: ['ignore', 'ignore', 'ignore', 'ipc'] });
      let received, timedOut = false, killTimer, settled = false;
      const stop = () => { child.kill('SIGTERM'); killTimer ??= setTimeout(() => child.kill('SIGKILL'), graceMs); };
      const timer = setTimeout(() => { timedOut = true; stop(); }, timeoutMs);
      child.once('message', message => { received = message; });
      child.once('error', stop);
      const finish = code => {
        if (settled) return;
        settled = true;
        clearTimeout(timer); clearTimeout(killTimer);
        if (timedOut) reject(new Error('study_timeout'));
        else if (code !== 0 || !validRawResult(received)) reject(new Error('study_invalid_result'));
        else resolve(received);
      };
      child.once('exit', finish);
      child.once('close', finish);
      child.send({ imageBytes }, error => { if (error) stop(); });
    });
  } finally { imageBytes.fill(0); }
}

function validFieldTuningRow(row) {
  return row && Object.keys(row).length === 5 && ['condition', 'input', 'outcome', 'elapsedMs', 'fields'].every(key => Object.hasOwn(row, key)) &&
    fieldTuningConditions.includes(row.condition) && fieldTuningInputs.includes(row.input) &&
    ['ready', 'engine-error', 'transform-error', 'not-run'].includes(row.outcome) && Number.isFinite(row.elapsedMs) && row.elapsedMs >= 0 && row.elapsedMs <= 120000 &&
    row.fields && Object.keys(row.fields).length === fields.length && fields.every(field => Object.hasOwn(row.fields, field)) &&
    fields.every(field => row.fields[field] === null || (typeof row.fields[field] === 'string' && row.fields[field].length <= 512));
}

function validFieldTuningResult(result) {
  if (!result || result.kind !== 'field-tuning-raw-v1' || !Array.isArray(result.rows) || result.rows.length !== fieldTuningConditions.length * fieldTuningInputs.length ||
    Buffer.byteLength(JSON.stringify(result)) > 32768 || (result.timedOut !== undefined && typeof result.timedOut !== 'boolean')) return false;
  const expected = new Set(fieldTuningConditions.flatMap(condition => fieldTuningInputs.map(input => `${condition}:${input}`)));
  const seen = new Set();
  return result.rows.every(row => {
    if (!validFieldTuningRow(row)) return false;
    const key = `${row.condition}:${row.input}`;
    if (!expected.has(key) || seen.has(key)) return false;
    seen.add(key);
    return true;
  }) && seen.size === expected.size;
}

/** Runs only the fixed 6-condition by 2-input tuning matrix in one owned offline child. */
/** @param {{ imageBytes: Uint8Array, timeoutMs?: number, graceMs?: number, childFile?: string }} options @returns {Promise<{ kind: 'field-tuning-raw-v1', timedOut?: boolean, rows: FieldTuningRow[] }>} */
export async function runOwnedFieldTuningStudy({ imageBytes, timeoutMs = 120000, graceMs = 1000, childFile = fileURLToPath(import.meta.url) }) {
  if (!(imageBytes instanceof Uint8Array) || !imageBytes.length || imageBytes.length > maximumBytes || !Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 120000 || !Number.isSafeInteger(graceMs) || graceMs < 1 || graceMs > 2000) throw new Error('study_invalid_input');
  try {
    return await new Promise((resolve, reject) => {
      const child = fork(childFile, ['--field-tuning-child'], { cwd: process.cwd(), execArgv: [], env: { NODE_ENV: 'production' }, serialization: 'advanced', stdio: ['ignore', 'ignore', 'ignore', 'ipc'] });
      let received, timedOut = false, killTimer, settled = false;
      const completedRows = new Map();
      const stop = () => { child.kill('SIGTERM'); killTimer ??= setTimeout(() => child.kill('SIGKILL'), graceMs); };
      const timer = setTimeout(() => { timedOut = true; stop(); }, timeoutMs);
      child.on('message', message => {
        if (message?.kind === 'field-tuning-row-v1' && validFieldTuningRow(message.row)) completedRows.set(`${message.row.condition}:${message.row.input}`, message.row);
        else received = message;
      });
      child.once('error', stop);
      const finish = code => {
        if (settled) return;
        settled = true; clearTimeout(timer); clearTimeout(killTimer);
        if (timedOut) {
          const rows = fieldTuningConditions.flatMap(condition => fieldTuningInputs.map(input => completedRows.get(`${condition}:${input}`) ??
            { condition, input, outcome: 'not-run', elapsedMs: 0, fields: { holderName: null, documentNumber: null } }));
          const partial = { kind: 'field-tuning-raw-v1', timedOut: true, rows };
          if (validFieldTuningResult(partial)) resolve(partial); else reject(new Error('study_timeout'));
        }
        else if (code !== 0 || !validFieldTuningResult(received)) reject(new Error('study_invalid_result'));
        else resolve(received);
      };
      child.once('exit', finish); child.once('close', finish);
      child.send({ imageBytes }, error => { if (error) stop(); });
    });
  } finally { imageBytes.fill(0); }
}

/** Preferred parent entry point: summarize immediately and release raw OCR rows. */
/** @param {{ imageBytes: Uint8Array, truth?: FieldTuningTruth | null, timeoutMs?: number, graceMs?: number, childFile?: string }} options @returns {Promise<FieldTuningSummary>} */
export async function runAndSummarizeFieldTuningStudy({ imageBytes, truth = null, timeoutMs = 120000, graceMs = 1000, childFile = fileURLToPath(import.meta.url) }) {
  const raw = await runOwnedFieldTuningStudy({ imageBytes, timeoutMs, graceMs, childFile });
  try {
    return { ...summarizeFieldTuning(raw.rows, truth), timedOut: raw.timedOut === true };
  } finally { raw.rows.length = 0; }
}

async function runChild(imageBytes) {
  const { default: sharp } = await import('sharp');
  const { loadExistingEvidencePreparation, disableNetwork } = await import('./kyc-local-ocr-benchmark.mjs');
  const { toOcrLines, extractKycFields } = require('../../lib/kyc/runtime/ocr-fields.cjs');
  const { codes } = require('../../lib/kyc/runtime/tesseract-worker.cjs');
  const restore = disableNetwork();
  const source = Buffer.from(imageBytes);
  let normalized, worker;
  const prepared = [], originals = [], rows = [];
  try {
    if (!source.length || source.length > maximumBytes) throw new Error();
    const metadata = await sharp(source, imageOptions).metadata();
    if (metadata.format !== 'png' || (metadata.pages ?? 1) !== 1) throw new Error();
    normalized = await sharp(source, imageOptions).rotate().png().toBuffer();
    const dimensions = await sharp(normalized, imageOptions).metadata();
    if (dimensions.width !== 563 || dimensions.height !== 727) throw new Error();
    const prepare = await loadExistingEvidencePreparation();
    for (const rect of [{ left: 0, top: 0, width: 563, height: 356 }, { left: 0, top: 374, width: 563, height: 353 }]) {
      const bytes = await sharp(normalized, imageOptions).extract(rect).png().toBuffer();
      originals.push({ bytes, mimeType: 'image/png' });
      prepared.push(await prepare(bytes, 'image/png'));
    }
    const { createWorker, PSM } = require('tesseract.js');
    // The existing offline adapter accepts exact normalized local filenames.
    worker = await createWorker(codes, 1, { workerPath: require.resolve('../../lib/kyc/runtime/tesseract-worker.cjs'), langPath: fileURLToPath(new URL('../../lib/kyc/runtime', import.meta.url)), cacheMethod: 'none', gzip: true, logging: false, logger: () => {}, errorHandler: () => { throw new Error('study_engine_failed'); } });
    await worker.setParameters({ tessedit_pageseg_mode: PSM.AUTO, user_defined_dpi: '150' });
    for (const scenario of studyConditions) {
      const start = performance.now();
      const row = { scenario, outcome: 'ready', pairOutcome: 'ready', cropOutcome: 'ready', pair: null, crop: null, images: [], elapsedMs: 0 };
      const variants = [];
      try {
        try {
          for (let side = 0; side < 2; side += 1) variants.push(await makeStudyVariant(scenario === 'provided' ? originals[side] : { bytes: prepared[side].stored, mimeType: 'image/png' }, scenario));
          for (const variant of variants) {
            const meta = await sharp(variant.bytes, imageOptions).metadata();
            row.images.push({ bytes: variant.bytes.length, mimeType: variant.mimeType, width: meta.width, height: meta.height });
          }
        } catch { row.outcome = 'transform-error'; row.pairOutcome = 'not-run'; row.cropOutcome = 'not-run'; continue; }
        try {
          const front = toOcrLines((await worker.recognize(variants[0].bytes, {}, { text: false, blocks: true })).data);
          const back = toOcrLines((await worker.recognize(variants[1].bytes, {}, { text: false, blocks: true })).data);
          const extracted = extractKycFields({ front, back }, 'national_id');
          row.pair = { holderName: extracted.holderName, documentNumber: extracted.documentNumber };
        } catch { row.pairOutcome = 'engine-error'; }
        try {
          row.crop = { holderName: null, documentNumber: null };
          const angle = scenario === 'rotate-4' ? 4 : scenario === 'rotate-minus-4' ? -4 : 0;
          for (const [field, ratios] of [['holderName', [.03, .59, .64, .70]], ['documentNumber', [.03, .22, .63, .32]]]) {
            const box = ratios.map((ratio, index) => ratio * (index % 2 ? 356 : 563));
            const image = row.images[0];
            const crop = await sharp(variants[0].bytes, imageOptions).extract(mapStudyCrop(box, 563, 356, image.width, image.height, angle)).png().toBuffer();
            try {
              const observed = (await worker.recognize(crop)).data.text;
              row.crop[field] = typeof observed === 'string' && observed.length <= 512 && observed.trim() ? observed.trim() : null;
            } finally { crop.fill(0); }
          }
        } catch { row.cropOutcome = 'engine-error'; row.crop = null; }
      } finally {
        variants.forEach(image => image.bytes.fill(0));
        row.elapsedMs = performance.now() - start;
        rows.push(row);
      }
    }
    return { kind: 'single-sample-raw-v1', rows };
  } finally {
    await worker?.terminate();
    source.fill(0); imageBytes.fill(0); normalized?.fill(0);
    originals.forEach(image => image.bytes.fill(0));
    prepared.forEach(image => { image.ocr.fill(0); image.stored.fill(0); });
    restore();
  }
}

async function runFieldTuningChild(imageBytes, onRow = () => {}) {
  const { default: sharp } = await import('sharp');
  const { loadExistingEvidencePreparation, disableNetwork } = await import('./kyc-local-ocr-benchmark.mjs');
  const { toOcrLines, extractKycFields } = require('../../lib/kyc/runtime/ocr-fields.cjs');
  const { codes } = require('../../lib/kyc/runtime/tesseract-worker.cjs');
  const restore = disableNetwork();
  const source = Buffer.from(imageBytes);
  let normalized, worker;
  const sides = [], prepared = [], rows = [];
  try {
    if (!source.length || source.length > maximumBytes) throw new Error();
    const metadata = await sharp(source, imageOptions).metadata();
    if (metadata.format !== 'png' || (metadata.pages ?? 1) !== 1) throw new Error();
    normalized = await sharp(source, imageOptions).rotate().png().toBuffer();
    const dimensions = await sharp(normalized, imageOptions).metadata();
    if (dimensions.width !== 563 || dimensions.height !== 727) throw new Error();
    const prepare = await loadExistingEvidencePreparation();
    for (const rect of [{ left: 0, top: 0, width: 563, height: 356 }, { left: 0, top: 374, width: 563, height: 353 }]) {
      const bytes = await sharp(normalized, imageOptions).extract(rect).png().toBuffer();
      sides.push({ bytes, mimeType: 'image/png' });
      const watermarked = await prepare(bytes, 'image/png');
      prepared.push({ bytes: watermarked.stored, mimeType: 'image/png' });
      watermarked.ocr.fill(0);
    }
    const { createWorker, PSM } = require('tesseract.js');
    worker = await createWorker(codes, 1, { workerPath: require.resolve('../../lib/kyc/runtime/tesseract-worker.cjs'), langPath: fileURLToPath(new URL('../../lib/kyc/runtime', import.meta.url)), cacheMethod: 'none', gzip: true, logging: false, logger: () => {}, errorHandler: () => { throw new Error('study_engine_failed'); } });
    const parameters = condition => ({ tessedit_pageseg_mode: condition === 'W0' || condition === 'C0' ? PSM.AUTO : condition === 'C4' ? PSM.SINGLE_BLOCK : PSM.SINGLE_LINE,
      thresholding_method: condition === 'C3' || condition === 'C4' ? '2' : '0', user_defined_dpi: '150' });
    for (const input of fieldTuningInputs) {
      const images = input === 'provided' ? sides : prepared;
      for (const condition of fieldTuningConditions) {
        const row = { condition, input, outcome: 'ready', fields: { holderName: null, documentNumber: null } };
        const startedAt = performance.now();
        let stage = condition === 'W0' ? 'engine' : 'transform';
        try {
          if (condition === 'W0') {
            await worker.setParameters(parameters(condition));
            const front = toOcrLines((await worker.recognize(images[0].bytes, {}, { text: false, blocks: true })).data);
            const back = toOcrLines((await worker.recognize(images[1].bytes, {}, { text: false, blocks: true })).data);
            const extracted = extractKycFields({ front, back }, 'national_id');
            row.fields = { holderName: extracted.holderName, documentNumber: extracted.documentNumber };
          } else {
            for (const field of condition === 'C4' ? ['holderName'] : fields) {
              const ratios = field === 'holderName' ? [.03, .59, .64, .70] : [.03, .22, .63, .32];
              const box = { left: Math.floor(ratios[0] * 563), top: Math.floor(ratios[1] * 356),
                width: Math.ceil((ratios[2] - ratios[0]) * 563), height: Math.ceil((ratios[3] - ratios[1]) * 356) };
              let crop = await sharp(images[0].bytes, imageOptions).extract(box).png().toBuffer();
              try {
                const border = ['C2', 'C3', 'C4'].includes(condition) ? Math.max(2, Math.min(12, Math.round(box.height * 0.2))) : 0;
                if (border) {
                  const extended = await sharp(crop, imageOptions).extend({ top: border, bottom: border, left: border, right: border, background: '#ffffff' }).png().toBuffer();
                  crop.fill(0); crop = extended;
                }
                stage = 'engine';
                await worker.setParameters(parameters(condition));
                const output = (await worker.recognize(crop)).data.text;
                row.fields[field] = typeof output === 'string' && output.length <= 512 && output.trim() ? output.trim() : null;
              } finally { crop.fill(0); }
            }
          }
        } catch { row.outcome = stage === 'transform' ? 'transform-error' : 'engine-error'; row.fields = { holderName: null, documentNumber: null }; }
        row.elapsedMs = Math.min(120000, Math.max(0, performance.now() - startedAt));
        rows.push(row);
        onRow(row);
      }
    }
    return { kind: 'field-tuning-raw-v1', rows };
  } finally {
    await worker?.terminate();
    source.fill(0); imageBytes.fill(0); normalized?.fill(0);
    sides.forEach(image => image.bytes.fill(0)); prepared.forEach(image => image.bytes.fill(0));
    restore();
  }
}

if (process.argv[2] === '--study-child') {
  // No files are created by this process. Exit reclaims its native worker on lost ownership.
  process.once('disconnect', () => process.exit(1));
  process.once('SIGTERM', () => process.exit(1));
  process.on('uncaughtException', () => process.exit(1));
  process.on('unhandledRejection', () => process.exit(1));
  if (!process.connected) process.exit(1);
  let started = false;
  process.once('message', async message => {
    if (started) return;
    started = true;
    try {
      const result = await runChild(message.imageBytes);
      if (!process.connected) process.exit(1);
      process.send(result, () => process.exit(0));
    } catch { process.exit(1); }
  });
}
if (process.argv[2] === '--field-tuning-child') {
  process.once('disconnect', () => process.exit(1));
  process.once('SIGTERM', () => process.exit(1));
  process.on('uncaughtException', () => process.exit(1));
  process.on('unhandledRejection', () => process.exit(1));
  if (!process.connected) process.exit(1);
  let started = false;
  process.once('message', async message => {
    if (started) return;
    started = true;
    try {
      const result = await runFieldTuningChild(message.imageBytes, row => process.send?.({ kind: 'field-tuning-row-v1', row }, () => {}));
      if (!process.connected) process.exit(1);
      process.send(result, () => process.exit(0));
    } catch { process.exit(1); }
  });
}
