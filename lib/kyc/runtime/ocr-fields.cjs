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
          parsed.words = words.filter((word) => typeof word?.text === 'string' && word.bbox).map((word) => {
            const box = word.bbox;
            if (word.text.length > 256 || !['x0', 'y0', 'x1', 'y1'].every((key) => Number.isFinite(box[key])) ||
              box.x0 < 0 || box.y0 < 0 || box.x1 <= box.x0 || box.y1 <= box.y0 || box.x1 > dimensions.width || box.y1 > dimensions.height) return invalid();
            bytes += Buffer.byteLength(word.text, 'utf8');
            if (bytes > 65536) return invalid();
            return { text: word.text, confidence: score(word.confidence) ? word.confidence : null, bbox: { ...box } };
          });
          if (!parsed.words.length) delete parsed.words;
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

function mrzBirthDateToIso(value) {
  const today = new Date().toISOString().slice(0, 10);
  let year = Math.floor(Number(today.slice(0, 4)) / 100) * 100 + Number(value.slice(0, 2));
  if (`${year}-${value.slice(2, 4)}-${value.slice(4, 6)}` > today) year -= 100;
  // The MRZ has no century. Ambiguous older centuries require human review, never automatic agreement.
  return `${year}-${value.slice(2, 4)}-${value.slice(4, 6)}`;
}

const passportComparisonFields = ['document_number', 'holder_name', 'birth_date', 'expiry_date', 'nationality', 'issuer_country', 'sex'];

function normalizePassportName(value) {
  return typeof value === 'string' ? value.normalize('NFKC').toUpperCase().replace(/['’]/g, '').replace(/[,<\-]/g, ' ').replace(/\s+/g, ' ').trim() : '';
}

/** Provider observations are untrusted; retain only bounded text, scores and image geometry in memory. */
function validatePassportLayout(layout) {
  if (!layout || layout.schemaVersion !== 1 || !Number.isSafeInteger(layout.width) || !Number.isSafeInteger(layout.height) ||
    layout.width < 1 || layout.height < 1 || layout.width * layout.height > 20_000_000 || !Array.isArray(layout.lines) || layout.lines.length > 256) return invalid();
  let bytes = 0, words = 0;
  const item = (value, max) => {
    if (!value || typeof value.text !== 'string' || value.text.length > max || !(value.confidence === null || score(value.confidence))) return invalid();
    bytes += Buffer.byteLength(value.text);
    const box = value.bbox;
    if (bytes > 65536 || !box || !['x0', 'y0', 'x1', 'y1'].every((key) => Number.isFinite(box[key])) ||
      box.x0 < 0 || box.y0 < 0 || box.x1 <= box.x0 || box.y1 <= box.y0 || box.x1 > layout.width || box.y1 > layout.height) return invalid();
    return { text: value.text, confidence: value.confidence, bbox: { x0: box.x0, y0: box.y0, x1: box.x1, y1: box.y1 } };
  };
  return { schemaVersion: 1, width: layout.width, height: layout.height, lines: layout.lines.map((line) => {
    const parsed = item(line, 1024);
    if (line.words !== undefined) {
      if (!Array.isArray(line.words) || (words += line.words.length) > 4096) return invalid();
      parsed.words = line.words.map((word) => item(word, 256));
    }
    return parsed;
  }) };
}

function passportDate(value) {
  if (typeof value !== 'string') return null;
  const text = value.normalize('NFKC').toUpperCase();
  const candidates = text.match(/(?:\b\d{4}[-/.年]\d{1,2}[-/.月]\d{1,2}(?:日|\b)|\b\d{1,2}\s*(?:\d{1,2}(?:月|H)\s*\/\s*)?[A-Z]{3}\s*\d{4}\b|\b\d{1,2}[-/.]\d{1,2}[-/.]\d{4}\b)/g) ?? [];
  if (candidates.length !== 1) return null;
  let y, m, d;
  let match = /\b(\d{4})[-/.年](\d{1,2})[-/.月](\d{1,2})(?:日|\b)/.exec(text);
  if (match) [, y, m, d] = match;
  else {
    match = /\b(\d{1,2})\s*(?:(\d{1,2})(?:月|H)\s*\/\s*)?([A-Z]{3})\s*(\d{4})\b/.exec(text);
    if (match) {
      d = match[1]; m = String(['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'].indexOf(match[3]) + 1); y = match[4];
      if (match[2] && Number(match[2]) !== Number(m)) return null;
    } else {
      match = /\b(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})\b/.exec(text);
      if (match) [, d, m, y] = match;
    }
  }
  if (!y || Number(y) < 1900 || Number(y) > 2199 || Number(m) < 1 || Number(m) > 12 || Number(d) < 1 ||
    Number(d) > new Date(Date.UTC(Number(y), Number(m), 0)).getUTCDate()) return null;
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

function passportVisibleFields(lines, mrzLines, electronic) {
  const unique = (values) => { const found = [...new Set(values.filter(Boolean))]; return found.length === 1 ? found[0] : null; };
  const normalizeNumber = (value) => unique([...value.toUpperCase().matchAll(/(?<![A-Z0-9])(?:[GE]\s*\d(?:\s*\d){7}|E\s*[A-HJ-NP-Z](?:\s*\d){7})(?![A-Z0-9])/g)].map((match) => match[0].replace(/\s/g,'')));
  const latinName = (value) => {
    const name = normalizePassportName(value);
    return name.length >= 2 && name.length <= 160 && /^[A-Z][A-Z .'-]*$/.test(name) &&
      !/\b(?:NAME|SURNAME|GIVEN|NATIONALITY|PASSPORT|DATE|PLACE|CHINESE|CHN|AUTHORITY)\b/.test(name) ? name : null;
  };
  const country = (value) => {
    const code = value.trim().toUpperCase();
    const chinese = /\b(?:CHN|CHINESE|CN)\b|中国|中华人民共和国/i.test(code);
    // Recognised foreign values are contradictions. OCR noise/unknown labels stay missing, not invented nationalities.
    const foreign = code.match(/\b(?:USA|US|AMERICAN|MYS|MY|MALAYSIAN|SGP|SG|SINGAPOREAN|GBR|GB|BRITISH|AUS|AU|AUSTRALIAN|CAN|CA|CANADIAN|IND|IN|INDIAN|JPN|JP|JAPANESE|KOR|KR|KOREAN)\b/g) ?? [];
    if (chinese && foreign.length) return null;
    return chinese ? 'CN' : unique(foreign);
  };
  const sex = (value) => { const values = [...value.toUpperCase().matchAll(/(?:^|[\s/女男])([MFX])(?:$|\s)/g)].map((match) => match[1]); return unique(values); };
  const definitions = {
    number: [/(?:护照号码?|Passport\s*(?:No\.?|Number))\s*[:：./／]?\s*/i, normalizeNumber],
    fullName: [/(?:姓名\s*[/／]?\s*(?:Name)?|\b(?:Full\s+)?Name\b)\s*[:：./／]?\s*/i, latinName],
    surname: [/(?:\bSurname\b|姓\s*[/／])\s*[:：./／]?\s*/i, latinName],
    givenNames: [/(?:\bGiven\s*names?\b|名\s*[/／])\s*[:：./／]?\s*/i, latinName],
    expiryDate: [/(?:有效期至|\bDate\s*of\s*expiry\b)\s*[:：./／]?\s*/i, passportDate],
    birthDate: [/(?:出生日期|\bDate\s*of\s*birth\b)\s*[:：./／]?\s*/i, passportDate],
    nationality: [/(?:国籍|\bNationality\b)\s*[:：./／]?\s*/i, country],
    issuer: [/(?:国家码|\bCountry\s*code\b)\s*[:：./／]?\s*/i, country],
    sex: [/(?:性别|\bSex\b)\s*[:：./／]?\s*/i, sex],
  };
  const candidates = Object.fromEntries(Object.keys(definitions).map((key) => [key, []]));
  // Labels may be bilingual and appear mid-line. A next-line value needs the same spatial column.
  for (const [key, [pattern, parse]] of Object.entries(definitions)) {
    for (const line of lines) {
      if (key === 'fullName' && /Surname|Given\s*names?/i.test(line.text)) continue;
      const match = pattern.exec(line.text);
      if (!match) continue;
      const remainder = line.text.slice(match.index + match[0].length).trim();
      if (remainder) candidates[key].push(parse(remainder));
      else if (line.bbox) {
        const height = line.bbox.y1 - line.bbox.y0;
        const below = lines.filter((next) => next !== line && next.bbox.y0 >= line.bbox.y1 && next.bbox.y0 - line.bbox.y1 <= height * 3 &&
          Math.abs(next.bbox.x0 - line.bbox.x0) <= height * 2).sort((a, b) => a.bbox.y0 - b.bbox.y0);
        if (below[0]) candidates[key].push(parse(below[0].text));
      }
    }
  }
  // Template candidates remain independent observations: never select or repair them using MRZ values.
  const template = electronic ? electronicPassportRegions(mrzLines) : null;
  if (template) {
    for (const [key, region] of Object.entries(template.regions)) {
      for (const line of lines) {
        const tokens = line.words?.length ? line.words : [line];
        const text = tokens.filter(({ bbox }) => {
          const cx = (bbox.x0 + bbox.x1) / 2, cy = (bbox.y0 + bbox.y1) / 2;
          return cx >= region.x0 && cx <= region.x1 && cy >= region.y0 && cy <= region.y1;
        }).map((word) => word.text).join(' ').trim();
        if (text) candidates[key].push(definitions[key][1](text));
      }
    }
  }
  const result = Object.fromEntries(Object.entries(candidates).map(([key, values]) => [key, unique(values)]));
  const splitName = result.surname && result.givenNames ? normalizePassportName(`${result.surname} ${result.givenNames}`) : null;
  result.fullName = new Set(candidates.fullName.filter(Boolean)).size > 1 ? null : unique([result.fullName, splitName]);
  return result;
}

/** Fixed China electronic template geometry, anchored to its two independently recognised MRZ lines. */
function electronicPassportRegions(mrzLines) {
  if (mrzLines.length !== 2 || mrzLines.some((line) => !line.bbox)) return null;
  const [first, second] = [...mrzLines].sort((a,b) => a.bbox.y0-b.bbox.y0);
  const w1 = first.bbox.x1-first.bbox.x0, w2 = second.bbox.x1-second.bbox.x0;
  if (first.bbox.y1 >= second.bbox.y0 || Math.abs(first.bbox.x0-second.bbox.x0) > Math.max(w1,w2)*0.08 ||
    Math.min(w1,w2)/Math.max(w1,w2) < 0.8) return null;
  const left = Math.min(first.bbox.x0,second.bbox.x0), right = Math.max(first.bbox.x1,second.bbox.x1);
  const width = (right-left)/0.9, height = width/1.42;
  const x = left-width*0.05, y = second.bbox.y1+width*0.035-height;
  const relative = { number: [0.64,0.12,0.98,0.23], fullName: [0.30,0.25,0.64,0.37], issuer: [0.43,0.12,0.63,0.23],
    nationality: [0.40,0.37,0.62,0.49], birthDate: [0.62,0.37,0.95,0.49], expiryDate: [0.62,0.55,0.95,0.67], sex: [0.30,0.37,0.42,0.49] };
  return { width, height, x, y, regions: Object.fromEntries(Object.entries(relative).map(([key,[x0,y0,x1,y1]]) =>
    [key,{x0:x+width*x0,y0:y+height*y0,x1:x+width*x1,y1:y+height*y1}])) };
}

function passportMrzLines(lines) {
  return lines.filter(({text}) => {
    const value = text.toUpperCase().replace(/\s/g,'');
    return value.length === 44 && (/^P[A-Z<]CHN[A-Z<]+$/.test(value) || /^[A-Z0-9<]{9}[0-9]CHN[A-Z0-9<]+$/.test(value));
  });
}

/** At most one local crop per missing field; no answer values are supplied to the recognizer. */
function passportFieldRegions(layout, missingFields) {
  const safe = validatePassportLayout(layout), mrz = parseTd3Mrz(safe.lines);
  if (mrz.status !== 'valid' || mrz.documentType !== 'PO' || mrz.issuerCode !== 'CHN' || !/^E[A-Z0-9]{8}$/.test(mrz.documentNumber)) return [];
  const template = electronicPassportRegions(passportMrzLines(safe.lines));
  if (!template || !Array.isArray(missingFields)) return [];
  const mapping = {document_number:'number',holder_name:'fullName',birth_date:'birthDate',expiry_date:'expiryDate',nationality:'nationality',issuer_country:'issuer',sex:'sex'};
  return passportComparisonFields.filter((field)=>missingFields.includes(field)).map((field)=>{
    const key = mapping[field], region={...template.regions[key]};
    const band = key==='fullName' ? [0.29,0.35] : key==='expiryDate' ? [0.58,0.64] : ['number','issuer'].includes(key) ? [0.165,0.225] : [0.405,0.47];
    region.y0=template.y+template.height*band[0];region.y1=template.y+template.height*band[1];
    const x0=Math.max(0,Math.floor(region.x0)),y0=Math.max(0,Math.floor(region.y0));
    const x1=Math.min(safe.width,Math.ceil(region.x1)),y1=Math.min(safe.height,Math.ceil(region.y1));
    return {field,bbox:{x0,y0,x1,y1}};
  }).filter(({bbox})=>bbox.x1>bbox.x0&&bbox.y1>bbox.y0);
}

function extractKycFields(sides, documentType) {
  const unknown = { holderName: null, documentNumber: null, expiryDate: null, confidence: null, unreadable: true };
  if (documentType === 'passport') {
    return extractPassportFields(sides.frontLayout ?? null, sides.front);
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

function extractPassportFields(layout, fallbackLines) {
  const unknown = { holderName: null, documentNumber: null, expiryDate: null, confidence: null, unreadable: true };
  const lines = layout ? validatePassportLayout(layout).lines : fallbackLines;
  const mrz = parseTd3Mrz(lines);
  if (mrz.status !== 'valid') return { ...unknown, mrzStatus: mrz.status === 'invalid' ? 'invalid' : 'unreadable' };
  const chinesePassport = mrz.issuerCode === 'CHN' && mrz.nationalityCode === 'CHN'
    && (mrz.documentType === 'P<' || /^P[A-Z]$/.test(mrz.documentType));
  if (!chinesePassport) return { ...unknown, mrzStatus: 'unsupported', issuerCountry: null, nationality: null };
  if (!(/^[GE]\d{8}$/.test(mrz.documentNumber) || /^E[A-HJ-NP-Z]\d{7}$/.test(mrz.documentNumber))) {
    return { ...unknown, mrzStatus: 'unsupported', issuerCountry: 'CN', nationality: 'CN' };
  }
  const holderName = [mrz.surname, mrz.givenNames].filter(Boolean).join(' ').normalize('NFKC').replace(/\s+/g, ' ').toUpperCase();
  const mrzLines = passportMrzLines(lines);
  const firstMrzY = layout && mrzLines.length === 2 ? Math.min(...mrzLines.map((line) => line.bbox.y0)) : null;
  // VIZ observations must be wholly above the MRZ. Never use an MRZ value as its own confirmation.
  const visualLines = firstMrzY === null ? [] : lines.filter((line) => line.bbox.y1 < firstMrzY);
  const visible = passportVisibleFields(visualLines, layout && mrzLines.length === 2 ? mrzLines : [], mrz.documentType === 'PO' && mrz.documentNumber.startsWith('E'));
  const comparisons = [
    ['document_number', visible.number, mrz.documentNumber],
    ['holder_name', visible.fullName, normalizePassportName(holderName)],
    ['birth_date', visible.birthDate, mrzBirthDateToIso(mrz.birthDate)],
    ['expiry_date', visible.expiryDate, mrzDateToIso(mrz.expiryDate)],
    ['nationality', visible.nationality, 'CN'],
    ['issuer_country', visible.issuer, 'CN'],
    ['sex', visible.sex, mrz.sex],
  ];
  const visualFieldStatuses = Object.fromEntries(comparisons.map(([field, observed, expected]) =>
    [field, !observed ? 'missing' : observed === expected ? 'matched' : 'conflict']));
  const visualMismatchFields = passportComparisonFields.filter((field) => visualFieldStatuses[field] === 'conflict');
  const visualMissingFields = passportComparisonFields.filter((field) => visualFieldStatuses[field] === 'missing');
  const visualComparisonStatus = visualMismatchFields.length ? 'conflict' : visualMissingFields.length ? 'incomplete' : 'consistent';
  const confidence = visualComparisonStatus === 'consistent' ? minimum(lines.filter((line) => line.text.trim()).map((line) => line.confidence)) : null;
  return { holderName: holderName || null, documentNumber: mrz.documentNumber, expiryDate: mrzDateToIso(mrz.expiryDate),
    confidence: confidence === null ? null : confidence / 100, unreadable: false,
    issuerCountry: 'CN', nationality: 'CN', mrzStatus: 'valid', passportEvidenceVersion: 2,
    visualComparisonStatus, visualMismatchFields, visualMissingFields, visualFieldStatuses };
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

module.exports = { passportFieldRegions, normalizePassportName, validatePassportLayout, toOcrLines, extractKycFields, parseTd3Mrz, toOcrLayoutV1, extractMykadLayoutFieldsV1 };
