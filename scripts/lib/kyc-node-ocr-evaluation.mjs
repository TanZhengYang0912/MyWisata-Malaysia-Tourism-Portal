/** Local evaluation only. Samples and truth never enter reports or production APIs. */
import fs from 'node:fs/promises';
import path from 'node:path';
import { constants } from 'node:fs';
import { createHash, createHmac, randomBytes } from 'node:crypto';
import sharp from 'sharp';
const stages = ['initial', 'correction', 'resubmission', 'qa'];
const groups = ['baseline', 'assisted'];
const documentTypes = ['national_id', 'passport', 'driving_license'];
const sources = ['public-mock', 'authorized-mykad', 'authorized-passport'];
const layouts = ['mykad-labelled', 'mykad-unlabelled', 'passport-biodata', 'passport-cover', 'passport-legacy', 'other-unsupported'];
const registryKeys = ['caseId', 'personGroup', 'documentGroup', 'reviewCaseGroup', 'split', 'source', 'layout', 'truthStatus', 'documentType', 'group', 'stage'];
const scenarios = ['reference', 'jpeg-75', 'jpeg-40', 'width-900', 'blur-1', 'blur-2', 'rotate-4', 'rotate-minus-4', 'darken-070', 'glare-obscured', 'filter-normalise'];
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const maximumBytes = 5 * 1024 * 1024;
const invalid = () => { throw new Error('sample_manifest_invalid'); };
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const keysAllowed = (value, keys) => object(value) && Object.keys(value).every(key => keys.includes(key));
const text = (value, max) => typeof value === 'string' && value.length > 0 && value.length <= max;
const requiredSides = documentType => documentType === 'passport' ? ['front'] : ['front', 'back'];
const validImageFilename = value => typeof value === 'string' && /^[a-zA-Z0-9_-]+\.(png|jpe?g|webp)$/i.test(value);
function validateManifestSides(item) {
  const sides = requiredSides(item.documentType);
  if (sides.some(side => !validImageFilename(item[side]))) invalid();
  // A passport is a single biodata-page input. Rejecting a declared back page
  // prevents a caller from accidentally treating a visa/cover page as evidence.
  if (item.documentType === 'passport' && Object.hasOwn(item, 'back')) invalid();
}
function validateDocumentMetadata(row) {
  const passportLayouts = ['passport-biodata', 'passport-cover', 'passport-legacy'];
  const mykadLayouts = ['mykad-labelled', 'mykad-unlabelled'];
  if (row.source === 'authorized-passport' && row.documentType !== 'passport') invalid();
  if (row.documentType === 'passport' && !passportLayouts.includes(row.layout) && row.layout !== 'other-unsupported') invalid();
  if (row.documentType !== 'passport' && passportLayouts.includes(row.layout)) invalid();
  if (row.documentType !== 'passport' && row.layout !== 'other-unsupported' && !mykadLayouts.includes(row.layout)) invalid();
}
async function privateFile(filename, maximum) {
  const meta = await fs.lstat(filename);
  if (!meta.isFile() || meta.isSymbolicLink() || (meta.mode & 0o777) !== 0o600 || meta.uid !== process.getuid?.() || meta.size > maximum) invalid();
  return meta;
}
async function readPrivateFile(filename, maximum) {
  const handle = await fs.open(filename, constants.O_RDONLY | constants.O_NOFOLLOW);
  let bytes;
  try {
    const meta = await handle.stat();
    if (!meta.isFile() || (meta.mode & 0o777) !== 0o600 || meta.uid !== process.getuid?.() || meta.size > maximum) invalid();
    // Bound allocation even if a local file grows after stat; a changed size is rejected.
    bytes = Buffer.alloc(meta.size + 1);
    let length = 0;
    while (length < bytes.length) {
      const result = await handle.read(bytes, length, bytes.length - length, length);
      if (!result.bytesRead) break;
      length += result.bytesRead;
    }
    if (length !== meta.size) invalid();
    return bytes.subarray(0, length);
  } catch { bytes?.fill(0); return invalid(); }
  finally { await handle.close(); }
}

/** A full registry is checked even when a run selects only one of its cases. */
export function validateStudyPartition(registry) {
  if (!Array.isArray(registry) || !registry.length || registry.length > 80) invalid();
  const cases = new Set(), persons = new Map(), documents = new Map(), reviews = new Map();
  const assign = (map, key, value) => {
    if (map.has(key) && map.get(key) !== value) invalid();
    map.set(key, value);
  };
  for (const row of registry) {
    if (!keysAllowed(row, registryKeys) || Object.keys(row).length !== registryKeys.length ||
      !['caseId', 'personGroup', 'documentGroup', 'reviewCaseGroup'].every(key => typeof row[key] === 'string' && uuid.test(row[key])) ||
      !['development', 'validation', 'holdout'].includes(row.split) || !sources.includes(row.source) ||
      !layouts.includes(row.layout) || !['double-checked', 'disputed'].includes(row.truthStatus) ||
      !documentTypes.includes(row.documentType) || !groups.includes(row.group) || !stages.includes(row.stage) || cases.has(row.caseId)) invalid();
    validateDocumentMetadata(row);
    cases.add(row.caseId);
    assign(persons, row.personGroup, JSON.stringify([row.split, row.group]));
    assign(documents, row.documentGroup, JSON.stringify([row.personGroup, row.split, row.source, row.layout, row.documentType]));
    assign(reviews, row.reviewCaseGroup, JSON.stringify([row.personGroup, row.split, row.group]));
  }
  if (documents.size > 20) invalid();
}

/** Supervisor pins this digest independently; a digest inside a manifest is never authority. */
export function sealStudyRegistry(registry) {
  validateStudyPartition(registry);
  const canonical = [...registry].sort((a, b) => a.caseId < b.caseId ? -1 : a.caseId > b.caseId ? 1 : 0)
    .map(row => Object.fromEntries(registryKeys.map(key => [key, row[key]])));
  return createHash('sha256').update(JSON.stringify(canonical), 'utf8').digest('hex');
}

function studyMetadata(manifest, seal) {
  if (!keysAllowed(manifest, ['schemaVersion', 'protocolVersion', 'registry', 'selection', 'scenario', 'cases']) ||
    manifest.schemaVersion !== 2 || manifest.protocolVersion !== 'kyc-ocr-study-v2' || !scenarios.includes(manifest.scenario) ||
    !/^[a-f0-9]{64}$/.test(seal ?? '') || sealStudyRegistry(manifest.registry) !== seal ||
    !Array.isArray(manifest.selection) || !manifest.selection.length || manifest.selection.length > 20 ||
    new Set(manifest.selection).size !== manifest.selection.length || !Array.isArray(manifest.cases) || manifest.cases.length !== manifest.selection.length) invalid();
  const registry = new Map(manifest.registry.map(row => [row.caseId, row]));
  const declared = new Set();
  for (const item of manifest.cases) {
    const row = registry.get(item?.caseId);
    if (!keysAllowed(item, [...registryKeys, 'front', 'back', 'expectedHolderName', 'expectedDocumentNumber', 'profile']) ||
      !row || registryKeys.some(key => item[key] !== row[key]) || !manifest.selection.includes(item.caseId) || declared.has(item.caseId) ||
      !text(item.expectedHolderName, 160) || !text(item.expectedDocumentNumber, 40) ||
      !(item.profile === null || (keysAllowed(item.profile, ['holderName', 'enteredDocumentNumber']) && Object.keys(item.profile).length === 2 &&
        (item.profile.holderName === null || text(item.profile.holderName, 160)) && (item.profile.enteredDocumentNumber === null || text(item.profile.enteredDocumentNumber, 40))))) invalid();
    validateManifestSides(item);
    declared.add(item.caseId);
  }
}

function aggregateMetadata(items, scenario) {
  const strata = new Map();
  for (const item of items) {
    const row = { source: item.source, layout: item.layout, split: item.split, documentType: item.documentType, truthStatus: item.truthStatus, scenario };
    const key = JSON.stringify(row);
    if (!strata.has(key)) strata.set(key, { ...row, selected: 0 });
    strata.get(key).selected += 1;
  }
  return { selected: items.length, people: new Set(items.map(item => item.personGroup)).size,
    documents: new Set(items.map(item => item.documentGroup)).size, cases: new Set(items.map(item => item.reviewCaseGroup)).size,
    images: items.reduce((sum, item) => sum + requiredSides(item.documentType).length, 0), strata: [...strata.values()],
    assignedCases: Object.fromEntries(groups.map(group => [group, new Set(items.filter(item => item.group === group).map(item => item.reviewCaseGroup)).size])) };
}

function lazyStudy(plans, manifest) {
  let used = false;
  return Object.freeze({ schemaVersion: 2, protocolVersion: manifest.protocolVersion, scenario: manifest.scenario,
    summary: aggregateMetadata(plans.map(plan => plan.item), manifest.scenario),
    async *[Symbol.asyncIterator]() {
      if (used) invalid();
      used = true;
      for (const { item, files } of plans) {
        const images = [];
        try {
          for (const file of files) images.push({ mimeType: file.mimeType, bytes: await readPrivateFile(file.file, maximumBytes) });
          yield { ...item, scenario: manifest.scenario, front: images[0], ...(images[1] ? { back: images[1] } : {}) };
        } catch { throw new Error('sample_manifest_invalid'); }
        finally { for (const image of images) image.bytes.fill(0); }
      }
    },
  });
}
/** @param {Record<string, string | undefined>} env @param {boolean} manual */
export async function loadAuthorizedSamples(env = process.env, manual = false) {
  if (env[manual ? 'KYC_NODE_OCR_REVIEW_SESSION' : 'KYC_NODE_OCR_EVALUATION'] !== '1' || !env.KYC_NODE_OCR_SAMPLE_MANIFEST) throw new Error('sample_authorization_required');
  const loaded = [];
  try {
    const filename = path.resolve(env.KYC_NODE_OCR_SAMPLE_MANIFEST);
    const root = path.dirname(filename);
    const dir = await fs.lstat(root);
    if (!dir.isDirectory() || dir.isSymbolicLink() || (dir.mode & 0o777) !== 0o700 || dir.uid !== process.getuid?.() || await fs.realpath(root) !== root) invalid();
    await privateFile(filename, 65536);
    const manifestBytes = await readPrivateFile(filename, 65536);
    let manifest;
    try { manifest = JSON.parse(manifestBytes.toString('utf8')); }
    finally { manifestBytes.fill(0); }
    const version2 = manifest?.schemaVersion === 2;
    if (version2) studyMetadata(manifest, env.KYC_NODE_OCR_STUDY_SEAL);
    else if (manual || !manifest || Object.keys(manifest).join() !== 'cases' || !Array.isArray(manifest.cases) || !manifest.cases.length || manifest.cases.length > 20) invalid();
    // Manual reference study and field-corruption study are distinct protocols.
    if (manual && manifest.scenario !== 'reference') invalid();
    const plans = [];
    for (const item of manifest.cases) {
      if (!item || typeof item !== 'object' || (!version2 && Object.keys(item).some(key => !['front', 'back', 'documentType', 'expectedHolderName', 'expectedDocumentNumber', 'group', 'stage'].includes(key))) ||
        !['national_id', 'passport', 'driving_license'].includes(item.documentType) || !['baseline', 'assisted'].includes(item.group) || !stages.includes(item.stage) ||
        typeof item.expectedHolderName !== 'string' || item.expectedHolderName.length > 160 || typeof item.expectedDocumentNumber !== 'string' || item.expectedDocumentNumber.length > 40) invalid();
      validateManifestSides(item);
      const files = [];
      for (const side of requiredSides(item.documentType)) {
        const name = item[side];
        const file = path.join(root, name);
        await privateFile(file, maximumBytes);
        if (await fs.realpath(file) !== file) invalid();
        files.push({ file, mimeType: /\.png$/i.test(name) ? 'image/png' : /\.webp$/i.test(name) ? 'image/webp' : 'image/jpeg' });
      }
      plans.push({ item, files });
    }
    if (version2) return lazyStudy(plans, manifest);
    // Validate every manifest entry before reading any image; no globbing or inventory download.
    for (const { item, files } of plans) {
      const images = [];
      try {
        for (const file of files) images.push({ mimeType: file.mimeType, bytes: await readPrivateFile(file.file, maximumBytes) });
        loaded.push({ ...item, front: images[0], ...(images[1] ? { back: images[1] } : {}) });
      } catch { for (const image of images) image.bytes.fill(0); invalid(); }
    }
    return loaded;
  } catch {
    for (const item of loaded) { item.front?.bytes.fill(0); item.back?.bytes.fill(0); }
    throw new Error('sample_manifest_invalid');
  }
}

export function normalizeEvaluationField(field, value) {
  if (typeof value !== 'string') return '';
  if (field === 'documentNumber') return value.replace(/[-\s]/g, '').toUpperCase();
  return value.normalize('NFKC').replace(/\s+/g, ' ').trim().toUpperCase();
}

/** Loads one locally supplied reference only after explicit evaluation opt-in. */
/** @param {Record<string, string | undefined>} env */
export async function loadPrivateStudyTruth(env = process.env) {
  const invalidTruth = () => { throw new Error('private_study_truth_invalid'); };
  if (env.KYC_NODE_OCR_EVALUATION !== '1' || typeof env.KYC_NODE_OCR_TRUTH_MANIFEST !== 'string' || !env.KYC_NODE_OCR_TRUTH_MANIFEST) {
    throw new Error('private_study_truth_authorization_required');
  }
  let bytes;
  try {
    const filename = path.resolve(env.KYC_NODE_OCR_TRUTH_MANIFEST);
    const root = path.dirname(filename);
    const directory = await fs.lstat(root);
    if (!directory.isDirectory() || directory.isSymbolicLink() || (directory.mode & 0o777) !== 0o700 || directory.uid !== process.getuid?.() || await fs.realpath(root) !== root) invalidTruth();
    await privateFile(filename, 4096);
    bytes = await readPrivateFile(filename, 4096);
    const value = JSON.parse(bytes.toString('utf8'));
    const keys = ['schemaVersion', 'truthStatus', 'holderName', 'documentNumber'];
    if (!object(value) || Object.keys(value).length !== keys.length || keys.some(key => !Object.hasOwn(value, key)) ||
      value.schemaVersion !== 1 || !['single-checked', 'double-checked', 'disputed'].includes(value.truthStatus) ||
      !text(value.holderName, 160) || !text(value.documentNumber, 40) ||
      normalizeEvaluationField('holderName', value.holderName).length < 2 ||
      !/^[\p{L}\p{M} .,'’/@()\-]+$/u.test(value.holderName) ||
      !/^\d{12}$/.test(normalizeEvaluationField('documentNumber', value.documentNumber))) invalidTruth();
    return { schemaVersion: 1, truthStatus: value.truthStatus,
      holderName: value.holderName.normalize('NFKC').replace(/\s+/g, ' ').trim(),
      documentNumber: normalizeEvaluationField('documentNumber', value.documentNumber) };
  } catch {
    throw new Error('private_study_truth_invalid');
  } finally { bytes?.fill(0); }
}

/** Deterministic transforms stay in memory; reference returns a separately owned copy. */
export async function makeCorruptionVariant(image, scenario, timeoutMs = 5000) {
  try {
    if (!scenarios.includes(scenario) || !(image?.bytes instanceof Uint8Array) || !image.bytes.length || image.bytes.length > maximumBytes ||
      !Number.isFinite(timeoutMs) || timeoutMs < 1000 || timeoutMs > 5000) throw new Error();
    const options = { limitInputPixels: 20_000_000, failOn: 'error' };
    const deadline = performance.now() + timeoutMs;
    const seconds = Math.max(1, Math.floor(timeoutMs / 1000));
    const meta = await sharp(image.bytes, options).timeout({ seconds }).metadata();
    const mimeType = { png: 'image/png', jpeg: 'image/jpeg', webp: 'image/webp' }[meta.format];
    if (!mimeType || mimeType !== image.mimeType || (meta.pages ?? 1) !== 1 || !meta.width || !meta.height || meta.width * meta.height > 20_000_000) throw new Error();
    if (scenario === 'reference') return { mimeType, bytes: Uint8Array.from(image.bytes) };
    const remainingSeconds = Math.floor((deadline - performance.now()) / 1000);
    if (remainingSeconds < 1) throw new Error();
    let pipeline = sharp(image.bytes, options).timeout({ seconds: remainingSeconds });
    if (scenario.startsWith('jpeg-')) pipeline = pipeline.jpeg({ quality: scenario === 'jpeg-75' ? 75 : 40 });
    else {
      if (scenario === 'width-900') pipeline = pipeline.resize({ width: 900, withoutEnlargement: true });
      if (scenario.startsWith('blur-')) pipeline = pipeline.blur(scenario === 'blur-1' ? 1 : 2);
      if (scenario.startsWith('rotate-')) pipeline = pipeline.rotate(scenario === 'rotate-4' ? 4 : -4, { background: '#ffffff' });
      if (scenario === 'darken-070') pipeline = pipeline.modulate({ brightness: 0.70 });
      if (scenario === 'filter-normalise') pipeline = pipeline.greyscale().normalise();
      if (scenario === 'glare-obscured') {
        const stripe = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${meta.width}" height="${meta.height}"><rect x="${Math.floor(meta.width * 0.4)}" y="0" width="${Math.max(1, Math.floor(meta.width * 0.2))}" height="${meta.height}" fill="white"/></svg>`);
        pipeline = pipeline.composite([{ input: stripe }]);
      }
      pipeline = pipeline.png();
    }
    const { data, info } = await pipeline.toBuffer({ resolveWithObject: true });
    if (data.length > maximumBytes || info.width * info.height > 20_000_000) { data.fill(0); throw new Error(); }
    return { mimeType: scenario.startsWith('jpeg-') ? 'image/jpeg' : 'image/png', bytes: data };
  } catch { throw new Error('sample_transform_failed'); }
}

const fieldCounters = denominator => ({ denominator, correct: 0, wrong: 0, unknown: 0, engineErrors: 0, transformErrors: 0, notRun: denominator });
const eligible = row => row.truthStatus === 'double-checked'
  && ((row.documentType === 'national_id' && row.layout !== 'other-unsupported')
    || (row.documentType === 'passport' && row.layout === 'passport-biodata'));
function counterFields(denominator) { return { holderName: fieldCounters(denominator), documentNumber: fieldCounters(denominator) }; }
function finishFields(fields) {
  for (const field of Object.values(fields)) {
    field.accuracy = field.denominator ? field.correct / field.denominator : null;
    field.conditionalAccuracy = field.correct + field.wrong ? field.correct / (field.correct + field.wrong) : null;
  }
}
function durations(values) {
  if (!values.length) return { samples: 0, meanMs: null, medianMs: null, p95Ms: null };
  const sorted = [...values].sort((a, b) => a - b);
  return { samples: sorted.length, meanMs: values.reduce((sum, value) => sum + value, 0) / values.length,
    medianMs: sorted.length % 2 ? sorted[Math.floor(sorted.length / 2)] : (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2,
    p95Ms: sorted[Math.ceil(sorted.length * 0.95) - 1] };
}

function passportCheckCounter(denominator, statuses) {
  return { denominator, ...Object.fromEntries([...statuses, 'missing'].map(status => [status, 0])),
    missingFields: 0, conflictingFields: 0, engineErrors: 0, transformErrors: 0,
    notRun: denominator, totalMs: 0, meanMs: null };
}
function passportChecks(denominator) {
  return { mrz: passportCheckCounter(denominator, ['valid', 'invalid', 'unreadable', 'unsupported']),
    visualComparison: passportCheckCounter(denominator, ['consistent', 'conflict', 'incomplete']) };
}
function finishPassportChecks(checks) {
  for (const counter of Object.values(checks)) {
    const processed = counter.denominator - counter.notRun;
    counter.meanMs = processed ? counter.totalMs / processed : null;
  }
}
function fieldsArray(value) { return Array.isArray(value) ? value.slice(0, 256) : []; }
function fieldStatusCount(value, status) {
  return object(value) ? Object.values(value).slice(0, 256).filter(fieldStatus => fieldStatus === status).length : 0;
}
function passportEvidence(sample, front, back) {
  return sample.documentType === 'passport'
    ? { documentType: sample.documentType, front }
    : { documentType: sample.documentType, front, back };
}
function recordPassportChecks(checks, result, category, elapsedMs) {
  const fields = result?.fields ?? {};
  for (const [kind, counter] of Object.entries(checks)) {
    counter.notRun -= 1;
    counter.totalMs += elapsedMs;
    if (category) {
      counter[category] += 1;
      continue;
    }
    const status = kind === 'mrz' ? fields.mrzStatus : fields.visualComparisonStatus;
    const statuses = kind === 'mrz' ? ['valid', 'invalid', 'unreadable', 'unsupported'] : ['consistent', 'conflict', 'incomplete'];
    if (statuses.includes(status)) counter[status] += 1;
    else counter.missing += 1;
    const missing = fieldsArray(kind === 'mrz'
      ? (fields.mrzMissingFields ?? fields.missingMrzFields)
      : (fields.visualMissingFields ?? fields.visualComparisonMissingFields));
    const conflicting = fieldsArray(kind === 'mrz'
      ? (fields.mrzConflictingFields ?? fields.mrzMismatchFields)
      : (fields.visualMismatchFields ?? fields.visualComparisonConflictingFields));
    const visualMissing = kind === 'visualComparison' ? fieldStatusCount(fields.visualFieldStatuses, 'missing') : 0;
    const visualConflicting = kind === 'visualComparison' ? fieldStatusCount(fields.visualFieldStatuses, 'conflict') : 0;
    counter.missingFields += missing.length || visualMissing || (status === 'incomplete' ? 1 : 0);
    counter.conflictingFields += conflicting.length || visualConflicting || (status === 'conflict' ? 1 : 0);
  }
}

async function evaluateStudy(samples, recognize, options) {
  const now = options.now ?? (() => performance.now());
  const budget = Math.min(300000, Math.max(0, options.budgetMs ?? 300000));
  const deadline = now() + budget;
  const strata = samples.summary.strata.map(row => ({ ...row, fields: counterFields(eligible(row) ? row.selected : 0) }));
  const denominator = strata.reduce((sum, row) => sum + row.fields.holderName.denominator, 0);
  const passportDenominator = strata.filter(row => eligible(row) && row.documentType === 'passport')
    .reduce((sum, row) => sum + row.selected, 0);
  const report = { schemaVersion: 2, protocolVersion: samples.protocolVersion, scenario: samples.scenario, kind: 'descriptive_field_evaluation',
    samples: 0, numberExact: 0, nameExact: 0, unknown: 0, wrongFields: 0, engineErrors: 0, transformErrors: 0, totalMs: 0,
    counts: { selected: samples.summary.selected, people: samples.summary.people, documents: samples.summary.documents, cases: samples.summary.cases, images: samples.summary.images,
      eligible: denominator, disputed: strata.filter(row => row.truthStatus === 'disputed').reduce((sum, row) => sum + row.selected, 0),
      unsupported: strata.filter(row => row.truthStatus !== 'disputed' && !eligible(row)).reduce((sum, row) => sum + row.selected, 0),
      passportEligible: passportDenominator, processed: 0, notRun: denominator, variants: 0 },
    fields: counterFields(denominator), strata, latency: durations([]), passportChecks: passportChecks(passportDenominator),
    identityAuthenticity: 'unmeasured', finalApprovalError: 'unmeasured', productionFalseMatch: 'unmeasured' };
  const times = [];
  const iterator = samples[Symbol.asyncIterator]();
  try {
    while (deadline - now() >= 35000) {
      const next = await iterator.next();
      if (next.done) break;
      const sample = next.value;
      if (!eligible(sample)) continue;
      const stratum = strata.find(row => ['source', 'layout', 'split', 'documentType', 'truthStatus'].every(key => row[key] === sample[key]));
      const variants = [];
      let result, category = null;
      const begin = now();
      try {
        for (const side of requiredSides(sample.documentType)) variants.push(await makeCorruptionVariant(sample[side], samples.scenario, Math.min(5000, deadline - now() - 25000)));
        if (deadline - now() < 25000) break;
        try { result = await recognize(passportEvidence(sample, variants[0], variants[1])); }
        catch { category = 'engineErrors'; }
        if (!category && result?.ok !== true) category = 'engineErrors';
      } catch { category = 'transformErrors'; }
      finally { for (const image of variants) image.bytes.fill(0); }
      const ms = Math.max(0, now() - begin);
      times.push(ms); report.totalMs += ms; report.samples += 1; report.counts.processed += 1; report.counts.notRun -= 1;
      if (samples.scenario !== 'reference') report.counts.variants += 1;
      if (category) report[category] += 1;
      if (sample.documentType === 'passport') recordPassportChecks(report.passportChecks, result, category, ms);
      for (const [field, expected, legacy] of [['holderName', 'expectedHolderName', 'nameExact'], ['documentNumber', 'expectedDocumentNumber', 'numberExact']]) {
        const actual = result?.fields?.[field];
        const outcome = category ?? (!text(actual, field === 'holderName' ? 160 : 40) ? 'unknown' :
          normalizeEvaluationField(field, actual) === normalizeEvaluationField(field, sample[expected]) ? 'correct' : 'wrong');
        for (const counts of [report.fields[field], stratum.fields[field]]) { counts.notRun -= 1; counts[outcome] += 1; }
        if (outcome === 'correct') report[legacy] += 1;
        else if (outcome === 'unknown') report.unknown += 1;
        else if (outcome === 'wrong') report.wrongFields += 1;
      }
    }
  } finally { await iterator.return(); }
  finishFields(report.fields);
  for (const row of strata) finishFields(row.fields);
  finishPassportChecks(report.passportChecks);
  report.latency = durations(times);
  return report;
}

/** @returns {Promise<Awaited<ReturnType<typeof evaluateStudy>> | { schemaVersion: 1, kind: 'legacy_exploratory_field_evaluation', samples: number, numberExact: number, nameExact: number, unknown: number, wrongFields: number, engineErrors: number, totalMs: number }>} */
export async function evaluateSamples(samples, recognize, options = {}) {
  if (samples?.schemaVersion === 2) return evaluateStudy(samples, recognize, options);
  const passportDenominator = samples.filter(sample => sample.documentType === 'passport').length;
  const report = { schemaVersion: 1, kind: 'legacy_exploratory_field_evaluation', samples: 0, numberExact: 0, nameExact: 0, unknown: 0, wrongFields: 0, engineErrors: 0, totalMs: 0,
    passportChecks: passportChecks(passportDenominator) };
  for (const sample of samples) {
    const begin = performance.now();
    let result, category = null;
    try { result = await recognize(passportEvidence(sample, sample.front, sample.back)); }
    catch { category = 'engineErrors'; }
    const elapsedMs = Math.max(0, performance.now() - begin);
    report.totalMs += elapsedMs; report.samples += 1;
    if (category || result?.ok !== true) {
      report.engineErrors += 1;
      if (sample.documentType === 'passport') recordPassportChecks(report.passportChecks, result, 'engineErrors', elapsedMs);
      continue;
    }
    if (sample.documentType === 'passport') recordPassportChecks(report.passportChecks, result, null, elapsedMs);
    for (const [field, expected, count] of [['documentNumber', 'expectedDocumentNumber', 'numberExact'], ['holderName', 'expectedHolderName', 'nameExact']]) {
      if (!result.fields[field]) report.unknown += 1;
      else if (normalizeEvaluationField(field, result.fields[field]) === normalizeEvaluationField(field, sample[expected])) report[count] += 1;
      else report.wrongFields += 1;
    }
  }
  finishPassportChecks(report.passportChecks);
  return report;
}

export function createReviewClock(now = () => performance.now()) {
  let activeMs = 0, started = null, finished = null;
  const pause = () => { if (started !== null) { activeMs += Math.max(0, now() - started); started = null; } };
  return { start() { if (started === null && !finished) started = now(); }, pause,
    finish(completed) { if (!finished) { pause(); finished = { completed: completed ? 1 : 0, aborted: completed ? 0 : 1, activeMs }; } return finished; } };
}

/** Gold is captured only for post-session assessment; it never builds visible profile/hints. */
export async function createBlindReviewPresentation(sample, runOcr) {
  const profile = sample.profile;
  const legalIdentity = { fullName: profile?.holderName ?? null, email: 'evaluation@example.test', phone: null };
  const unavailable = { status: 'unavailable', holderName: null, documentNumberLast4: null, confidence: null, expiryDate: null, mismatchFields: [], processedAt: null };
  if (sample.group === 'baseline') return { legalIdentity, ocr: null, assessHint: () => 'unmeasured' };
  if (!profile?.holderName || !profile.enteredDocumentNumber) return { legalIdentity, ocr: unavailable, assessHint: () => 'missing' };
  const hmacKey = randomBytes(32).toString('hex');
  let result;
  try {
    const input = passportEvidence(sample, sample.front, sample.back);
    result = await runOcr({ ...input,
      expectedHolderName: profile.holderName, enteredDocumentNumber: profile.enteredDocumentNumber, hmacKey });
  } catch { result = null; }
  const valid = result && ['matched', 'mismatch', 'unreadable', 'unavailable'].includes(result.status);
  const ocr = valid ? {
    status: result.status,
    holderName: text(result.holderName, 160) ? result.holderName : null,
    documentNumberLast4: typeof result.documentNumberLast4 === 'string' && /^[a-zA-Z0-9]{1,4}$/.test(result.documentNumberLast4) ? result.documentNumberLast4 : null,
    confidence: typeof result.confidence === 'number' && Number.isFinite(result.confidence) && result.confidence >= 0 && result.confidence <= 1 ? result.confidence : null,
    expiryDate: typeof result.expiryDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(result.expiryDate) ? result.expiryDate : null,
    mismatchFields: Array.isArray(result.mismatchFields) ? result.mismatchFields.filter(field => ['holder_name', 'document_number'].includes(field)) : [],
    processedAt: null,
  } : unavailable;
  return { legalIdentity, ocr,
    assessHint() {
      if (!valid || !ocr.holderName || !result.documentNumberHmac || ['unavailable', 'unreadable'].includes(ocr.status)) return 'missing';
      const truthHmac = createHmac('sha256', hmacKey).update(normalizeEvaluationField('documentNumber', sample.expectedDocumentNumber)).digest('hex');
      return result.documentNumberHmac === truthHmac && normalizeEvaluationField('holderName', ocr.holderName) === normalizeEvaluationField('holderName', sample.expectedHolderName) ? 'correct' : 'incorrect';
    },
  };
}

/** Session-only private deduplication. Reports expose counts, never case IDs or timelines. */
/** @param {null | Record<'baseline' | 'assisted', number>} assignmentCounts */
export function createReviewStudySummary(assignmentCounts = null) {
  if (assignmentCounts !== null && (!keysAllowed(assignmentCounts, groups) || Object.keys(assignmentCounts).length !== 2 ||
    !groups.every(group => Number.isSafeInteger(assignmentCounts[group]) && assignmentCounts[group] >= 0 && assignmentCounts[group] <= 20))) throw new Error('review_assignment_invalid');
  const cases = new Map(), steps = new Set(), stagesSummary = {}, hints = {};
  const totals = Object.fromEntries(groups.map(group => [group, { steps: 0, finishedSteps: 0, abortedSteps: 0, activeMs: 0, machineMs: 0 }]));
  return {
    record(sample, measurement, action, hintQuality = 'unmeasured', machineMs = 0) {
      if (!groups.includes(sample.group) || !stages.includes(sample.stage) || !['correct', 'incorrect', 'missing', 'unmeasured'].includes(hintQuality) ||
        !Number.isFinite(measurement.activeMs) || measurement.activeMs < 0 || !Number.isFinite(machineMs) || machineMs < 0 ||
        ![null, 'approve', 'reject', 'request_info'].includes(action) || !text(sample.caseId, 80) || !text(sample.reviewCaseGroup, 80)) throw new Error('review_measurement_invalid');
      const stepKey = sample.caseId;
      if (steps.has(stepKey)) throw new Error('review_measurement_duplicate');
      steps.add(stepKey);
      const previous = cases.get(sample.reviewCaseGroup);
      if (previous && previous.group !== sample.group) throw new Error('review_group_conflict');
      const state = previous ?? { group: sample.group, terminal: false };
      if (measurement.completed && ['approve', 'reject'].includes(action)) state.terminal = true;
      cases.set(sample.reviewCaseGroup, state);
      const add = target => {
        target.steps += 1; target.activeMs += measurement.activeMs; target.machineMs += machineMs;
        target.finishedSteps += measurement.completed ? 1 : 0; target.abortedSteps += measurement.aborted ? 1 : 0;
      };
      add(totals[sample.group]);
      const stageKey = `${sample.group}:${sample.stage}`;
      stagesSummary[stageKey] ??= { steps: 0, finishedSteps: 0, abortedSteps: 0, activeMs: 0, machineMs: 0 };
      add(stagesSummary[stageKey]);
      const hintKey = `${sample.group}:${hintQuality}`;
      hints[hintKey] ??= { steps: 0, finishedSteps: 0, abortedSteps: 0, activeMs: 0, machineMs: 0 };
      add(hints[hintKey]);
    },
    report() {
      /** @type {Record<string, { steps: number, finishedSteps: number, abortedSteps: number, activeMs: number, machineMs: number, assignedCases: number, startedCases: number, unstartedCases: number, terminalCases: number, pendingCases: number, minutesPerTerminalCase: number | null, minutesPerAssignedCase: number | null }>} */
      const result = {};
      for (const group of groups) {
        const started = [...cases.values()].filter(item => item.group === group);
        const assigned = assignmentCounts?.[group] ?? started.length;
        if (assigned < started.length) throw new Error('review_assignment_invalid');
        const terminal = started.filter(item => item.terminal).length;
        const total = totals[group];
        result[group] = { ...total, assignedCases: assigned, startedCases: started.length, unstartedCases: assigned - started.length, terminalCases: terminal, pendingCases: assigned - terminal,
          minutesPerTerminalCase: terminal ? total.activeMs / 60000 / terminal : null,
          minutesPerAssignedCase: assigned ? total.activeMs / 60000 / assigned : null };
      }
      return { kind: 'session_field_review_only', groups: result, stages: structuredClone(stagesSummary), fieldHintQuality: structuredClone(hints),
        fullCycleEfficiency: 'unmeasured', finalApprovalQuality: 'unmeasured', acrossSessionDeduplication: 'unmeasured' };
    },
  };
}
