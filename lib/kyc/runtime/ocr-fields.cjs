'use strict';

const invalid = () => { throw new Error('invalid_response'); };
const score = (value) => typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 100;
const minimum = (values) => values.length && values.every(score) ? Math.min(...values) : null;

/** Only bounded lines leave the library adapter; no page-wide score or raw dump. */
function collectOcrLines(data, dimensions = null) {
  if (!data || typeof data !== 'object') return invalid();
  if (data.blocks === null) return [];
  if (dimensions && (!Number.isSafeInteger(dimensions.width) || !Number.isSafeInteger(dimensions.height) || dimensions.width < 1 || dimensions.height < 1 || dimensions.width * dimensions.height > 20_000_000)) return invalid();
  const result = [];
  let nodes = 0, bytes = 0;
  const array = (value) => {
    if (!Array.isArray(value) || value.length > 8192 || (nodes += value.length) > 8192) return invalid();
    return value;
  };
  for (const block of array(data.blocks)) {
    for (const paragraph of array(block?.paragraphs)) {
      for (const line of array(paragraph?.lines)) {
        if (typeof line?.text !== 'string' || line.text.length > 1024 || [...line.text].length > 512 || result.length >= 256) return invalid();
        bytes += Buffer.byteLength(line.text, 'utf8');
        if (bytes > 65536) return invalid();
        const words = array(line.words);
        const parsed = { text: line.text.trim(), confidence: minimum(words.map((word) => word?.confidence)) };
        if (dimensions) {
          const bbox = line.bbox;
          if (!bbox || !['x0', 'y0', 'x1', 'y1'].every((key) => typeof bbox[key] === 'number' && Number.isFinite(bbox[key])) ||
            bbox.x0 < 0 || bbox.y0 < 0 || bbox.x1 <= bbox.x0 || bbox.y1 <= bbox.y0 || bbox.x1 > dimensions.width || bbox.y1 > dimensions.height) return invalid();
          parsed.bbox = { x0: bbox.x0, y0: bbox.y0, x1: bbox.x1, y1: bbox.y1 };
        }
        result.push(parsed);
      }
    }
  }
  return result;
}

function toOcrLines(data) { return collectOcrLines(data); }

function toOcrLayoutV1(data, dimensions) {
  if (!dimensions || !Number.isSafeInteger(dimensions.width) || !Number.isSafeInteger(dimensions.height) || dimensions.width < 1 || dimensions.height < 1 || dimensions.width * dimensions.height > 20_000_000) return invalid();
  return { schemaVersion: 1, width: dimensions?.width, height: dimensions?.height, lines: collectOcrLines(data, dimensions) };
}

function mrzCheckDigit(value) {
  const weights = [7, 3, 1];
  const characterValue = (character) => character === '<' ? 0 : /[0-9]/.test(character) ? Number(character) : character.charCodeAt(0) - 55;
  return String([...value].reduce((sum, character, index) => sum + characterValue(character) * weights[index % 3], 0) % 10);
}

function parseTd3Mrz(lines) {
  const unknown = { status: 'unreadable', documentType: null, issuerCode: null, nationalityCode: null, documentNumber: null,
    surname: null, givenNames: null, birthDate: null, expiryDate: null, sex: null };
  if (!Array.isArray(lines) || lines.length > 256) return unknown;
  const candidates = lines.map(({ text }) => typeof text === 'string' ? text.toUpperCase().replace(/\s/g, '') : '')
    .filter((text) => text.length === 44 && /^[A-Z0-9<]{44}$/.test(text));
  const pairs = [];
  for (let index = 0; index < candidates.length - 1; index += 1) {
    if (/^P[A-Z<]/.test(candidates[index])) pairs.push([candidates[index], candidates[index + 1]]);
  }
  if (pairs.length !== 1) return unknown;
  const [first, second] = pairs[0];
  const checks = mrzCheckDigit(second.slice(0, 9)) === second[9]
    && mrzCheckDigit(second.slice(13, 19)) === second[19]
    && mrzCheckDigit(second.slice(21, 27)) === second[27]
    && mrzCheckDigit(second.slice(28, 42)) === second[42]
    && mrzCheckDigit(`${second.slice(0, 10)}${second.slice(13, 20)}${second.slice(21, 43)}`) === second[43];
  const name = first.slice(5).split('<<');
  const surname = name[0].replace(/</g, ' ').trim() || null;
  const givenNames = name.slice(1).join('<<').replace(/</g, ' ').trim() || null;
  const validDate = (value) => {
    const month = Number(value.slice(2, 4)), day = Number(value.slice(4, 6));
    return month >= 1 && month <= 12 && day >= 1 && day <= new Date(Date.UTC(2000 + Number(value.slice(0, 2)), month, 0)).getUTCDate();
  };
  const datesValid = /^\d{6}$/.test(second.slice(13, 19)) && validDate(second.slice(13, 19))
    && /^\d{6}$/.test(second.slice(21, 27)) && validDate(second.slice(21, 27));
  const documentNumber = second.slice(0, 9).replace(/</g, '');
  if (!checks || !datesValid || !documentNumber || !surname) return { ...unknown, status: 'invalid' };
  return { status: 'valid', documentType: first.slice(0, 2), issuerCode: first.slice(2, 5), nationalityCode: second.slice(10, 13),
    documentNumber, surname, givenNames, birthDate: second.slice(13, 19), expiryDate: second.slice(21, 27), sex: second[20] };
}

function mrzDateToIso(value) {
  const year = Number(value.slice(0, 2));
  return `${year < 50 ? 2000 + year : 1900 + year}-${value.slice(2, 4)}-${value.slice(4, 6)}`;
}

function passportVisibleFields(lines) {
  const find = (label) => {
    const expression = new RegExp(`^${label}\\s*[:.]?\\s*(.*)$`, 'i');
    for (let index = 0; index < lines.length; index += 1) {
      const value = expression.exec(lines[index].text.trim());
      if (!value) continue;
      const candidate = (value[1] || lines[index + 1]?.text || '').trim();
      if (candidate && candidate.length <= 80) return candidate;
    }
    return null;
  };
  const date = (value) => {
    if (!value) return null;
    const normalized = value.trim().toUpperCase().replace(/[,]/g, '').replace(/\s+/g, ' ');
    let match = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/.exec(normalized);
    if (match) return `${match[1]}-${match[2].padStart(2, '0')}-${match[3].padStart(2, '0')}`;
    match = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/.exec(normalized);
    if (match) return `${match[3]}-${match[2].padStart(2, '0')}-${match[1].padStart(2, '0')}`;
    match = /^(\d{1,2})\s+([A-Z]{3})\s+(\d{4})$/.exec(normalized);
    if (match) {
      const month = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'].indexOf(match[2]) + 1;
      return month ? `${match[3]}-${String(month).padStart(2, '0')}-${match[1].padStart(2, '0')}` : null;
    }
    return null;
  };
  return {
    number: find('Passport\\s*(?:No\\.?|Number)'),
    surname: find('Surname'),
    givenNames: find('Given\\s*names?'),
    expiryDate: date(find('Date\\s*of\\s*expiry')),
    nationality: find('Nationality'),
    issuer: find('(?:Country\\s*code|Code)'),
  };
}

function extractKycFields(sides, documentType) {
  const unknown = { holderName: null, documentNumber: null, expiryDate: null, confidence: null, unreadable: true };
  if (documentType === 'passport') {
    const mrz = parseTd3Mrz(sides.front);
    if (mrz.status !== 'valid') return { ...unknown, mrzStatus: mrz.status === 'invalid' ? 'invalid' : 'unreadable' };
    const chinesePassport = mrz.issuerCode === 'CHN' && mrz.nationalityCode === 'CHN'
      && (mrz.documentType === 'P<' || /^P[A-Z]$/.test(mrz.documentType));
    if (!chinesePassport) return { ...unknown, mrzStatus: 'unsupported', issuerCountry: null, nationality: null };
    if (!(/^[GE]\d{8}$/.test(mrz.documentNumber) || /^E[A-HJ-NP-Z]\d{7}$/.test(mrz.documentNumber))) {
      return { ...unknown, mrzStatus: 'unsupported', issuerCountry: 'CN', nationality: 'CN' };
    }
    const holderName = [mrz.surname, mrz.givenNames].filter(Boolean).join(' ').normalize('NFKC').replace(/\s+/g, ' ').toUpperCase();
    const visible = passportVisibleFields(sides.front);
    const normalize = (value) => (value ?? '').normalize('NFKC').replace(/[^A-Z0-9]/gi, '').toUpperCase();
    const mismatches = [];
    const comparisons = [
      ['document_number', visible.number, mrz.documentNumber],
      ['surname', visible.surname, mrz.surname],
      ['given_names', visible.givenNames, mrz.givenNames],
      ['expiry_date', visible.expiryDate, mrzDateToIso(mrz.expiryDate)],
      ['nationality', visible.nationality, 'CHINESE'],
      ['issuer_country', visible.issuer, 'CHN'],
    ];
    for (const [field, observed, expected] of comparisons) {
      if (observed && normalize(observed) !== normalize(expected)) mismatches.push(field);
    }
    const complete = comparisons.every(([, observed]) => Boolean(observed));
    const visualComparisonStatus = mismatches.length ? 'conflict' : complete ? 'consistent' : 'incomplete';
    const confidence = minimum(sides.front.filter((line) => typeof line?.text === 'string' && line.text.trim()).map((line) => line.confidence));
    return { holderName: holderName || null, documentNumber: mrz.documentNumber, expiryDate: mrzDateToIso(mrz.expiryDate),
      confidence: confidence === null ? null : confidence / 100, unreadable: false,
      issuerCountry: 'CN', nationality: 'CN', mrzStatus: 'valid', visualComparisonStatus, visualMismatchFields: mismatches };
  }
  if (documentType !== 'national_id') return unknown;
  const numbers = new Map(), names = new Map();
  for (const lines of [sides.front, sides.back]) {
    if (!Array.isArray(lines) || lines.length > 256) return invalid();
    for (let index = 0; index < lines.length; index += 1) {
      const { text, confidence } = lines[index];
      if (typeof text !== 'string' || text.length > 1024) return invalid();
      for (const match of text.matchAll(/(?<!\d)\d{6}[- ]?\d{2}[- ]?\d{4}(?!\d)/g)) {
        const key = match[0].replace(/[- ]/g, '');
        numbers.set(key, [...(numbers.get(key) ?? []), confidence]);
      }
      const label = /^(?:NAME|NAMA|FULL NAME|NAMA PENUH|NAMA\s*\/\s*NAME)\s*(?::\s*(.*))?$/i.exec(text.trim());
      if (label) {
        const value = (label[1] || lines[index + 1]?.text || '').trim();
        if (value.length >= 2 && value.length <= 160 && /^[\p{L}\p{M} .,'’/@()-]+$/u.test(value) && !/^(?:NAME|NAMA)$/i.test(value)) {
          const key = value.normalize('NFKC').replace(/\s+/g, ' ').toUpperCase();
          names.set(key, [...(names.get(key) ?? []), confidence, ...(label[1] ? [] : [lines[index + 1]?.confidence])]);
        }
      }
    }
  }
  const documentNumber = numbers.size === 1 ? numbers.keys().next().value : null;
  const holderName = names.size === 1 ? names.keys().next().value : null;
  const confidence = documentNumber && holderName ? minimum([...numbers.get(documentNumber), ...names.get(holderName)]) : null;
  return { holderName, documentNumber, expiryDate: null, confidence: confidence === null ? null : confidence / 100, unreadable: documentNumber === null };
}

/** Research-only locator for a manually aligned reference card face. */
function extractMykadLayoutFieldsV1(layout, options) {
  const unknown = { holderName: null, documentNumber: null, layoutStatus: 'unknown', unreadable: true };
  if (!layout || layout.schemaVersion !== 1 || !Number.isSafeInteger(layout.width) || !Number.isSafeInteger(layout.height) ||
    layout.width < 1 || layout.height < 1 || layout.width * layout.height > 20_000_000 || !Array.isArray(layout.lines) || layout.lines.length > 256 ||
    !options || Object.keys(options).length !== 2 || options.layout !== 'mykad-front-reference-v1' || options.alignment !== 'manual-card-aligned') return unknown;
  const nameBox = { x0: layout.width * 0.03, y0: layout.height * 0.58, x1: layout.width * 0.55, y1: layout.height * 0.82 };
  const numberBox = { x0: layout.width * 0.03, y0: layout.height * 0.19, x1: layout.width * 0.66, y1: layout.height * 0.37 };
  const inBox = (bbox, box) => bbox.x0 >= box.x0 && bbox.y0 >= box.y0 && bbox.x1 <= box.x1 && bbox.y1 <= box.y1;
  const nameLines = [], numbers = new Set();
  let textBytes = 0;
  for (const line of layout.lines) {
    if (typeof line?.text === 'string') textBytes += Buffer.byteLength(line.text, 'utf8');
    if (!line || typeof line.text !== 'string' || line.text.length > 1024 || [...line.text].length > 512 ||
      (!Number.isFinite(line.confidence) && line.confidence !== null) || textBytes > 65536 || !line.bbox ||
      !['x0', 'y0', 'x1', 'y1'].every(key => Number.isFinite(line.bbox[key])) || line.bbox.x0 < 0 || line.bbox.y0 < 0 ||
      line.bbox.x1 <= line.bbox.x0 || line.bbox.y1 <= line.bbox.y0 || line.bbox.x1 > layout.width || line.bbox.y1 > layout.height ||
      (line.confidence !== null && (line.confidence < 0 || line.confidence > 100))) return unknown;
    const value = line.text.trim();
    if (inBox(line.bbox, numberBox)) {
      for (const match of value.matchAll(/(?<!\d)(\d{6})[- ]?(\d{2})[- ]?(\d{4})(?!\d)/g)) numbers.add(`${match[1]}${match[2]}${match[3]}`);
    }
    if (inBox(line.bbox, nameBox) && value.length <= 160 && /^[\p{L}\p{M} .,'’/@()\-]+$/u.test(value) &&
      [...value].filter(character => /[\p{L}\p{M}]/u.test(character)).length >= 2 && !/^(?:NAME|NAMA|FULL NAME|NAMA PENUH)$/i.test(value)) {
      nameLines.push({ text: value, bbox: line.bbox });
    }
  }
  nameLines.sort((a, b) => a.bbox.y0 - b.bbox.y0 || a.bbox.x0 - b.bbox.x0);
  const groups = [];
  for (const line of nameLines) {
    const previous = groups.at(-1);
    if (previous && line.bbox.y0 - previous.y1 <= layout.height * 0.035 && Math.abs(line.bbox.x0 - previous.x0) <= layout.width * 0.04) {
      previous.lines.push(line.text); previous.y1 = line.bbox.y1;
    } else groups.push({ x0: line.bbox.x0, y1: line.bbox.y1, lines: [line.text] });
  }
  const names = groups.map(group => group.lines.join(' ').normalize('NFKC').replace(/\s+/g, ' ').trim().toUpperCase());
  const holderName = names.length === 1 ? names[0] : null;
  const documentNumber = numbers.size === 1 ? numbers.values().next().value : null;
  return { holderName, documentNumber, layoutStatus: holderName && documentNumber ? 'located' : 'partial', unreadable: documentNumber === null };
}

module.exports = { toOcrLines, extractKycFields, parseTd3Mrz, toOcrLayoutV1, extractMykadLayoutFieldsV1 };
