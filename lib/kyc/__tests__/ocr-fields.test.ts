import { describe, expect, it } from 'vitest';
import { extractKycFields, extractMykadLayoutFieldsV1, parseTd3Mrz, toOcrLayoutV1, toOcrLines } from '../runtime/ocr-fields.cjs';

const line = (text: string, confidence: number | null = 90) => ({ text, confidence });
describe('bounded identity fields', () => {
  it('does not choose between conflicting sides using an expected answer', () => {
    expect(extractKycFields({ front: [line('990101-14-0001')], back: [line('990101-14-0002')] }, 'national_id'))
      .toMatchObject({ documentNumber: null, unreadable: true });
  });
  it('requires a name label and keeps unsupported layouts unknown', () => {
    expect(extractKycFields({ front: [line('SYNTHETIC PERSON'), line('990101-14-0001')], back: [] }, 'national_id').holderName).toBeNull();
    expect(extractKycFields({ front: [line('A12345678')], back: [] }, 'passport').unreadable).toBe(true);
  });
  it('parses ICAO TD3 fields only when line lengths and check digits are valid', () => {
    const result = parseTd3Mrz([
      line('P<UTOERIKSSON<<ANNA<MARIA<<<<<<<<<<<<<<<<<<<'),
      line('L898902C36UTO7408122F1204159ZE184226B<<<<<10'),
    ]);
    expect(result).toMatchObject({ status: 'valid', documentNumber: 'L898902C3', issuerCode: 'UTO', nationalityCode: 'UTO',
      surname: 'ERIKSSON', givenNames: 'ANNA MARIA', birthDate: '740812', expiryDate: '120415' });
    expect(parseTd3Mrz([line('P<UTOERIKSSON<<ANNA<MARIA'), line('L898902C36UTO7408122F1204159ZE184226B<<<<<10')]).status).toBe('unreadable');
    expect(parseTd3Mrz([line('P<UTOERIKSSON<<ANNA<MARIA<<<<<<<<<<<<<<<<<<<'), line('L898902C36UTO7408122F1204158ZE184226B<<<<<10')]).status).toBe('invalid');
  });
  it('keeps passport OCR unknown unless a unique Chinese ordinary passport MRZ is valid', () => {
    const lines = [
      line('P<CHNLI<<WEI<MING'.padEnd(44, '<')),
      line('EA12345676CHN9001011M3001019<<<<<<<<<<<<<<04'),
    ];
    expect(extractKycFields({ front: lines, back: [] }, 'passport')).toMatchObject({
      holderName: 'LI WEI MING', documentNumber: 'EA1234567', issuerCountry: 'CN', nationality: 'CN', mrzStatus: 'valid', unreadable: false,
    });
    expect(extractKycFields({ front: lines, back: [line('') ] }, 'passport').unreadable).toBe(false);
    expect(extractKycFields({ front: [line('PPUTOERIKSSON<<ANNA<MARIA<<<<<<<<<<<<<<<<<<<'), line('L898902C36UTO7408122F1204159ZE184226B<<<<<10')], back: [] }, 'passport'))
      .toMatchObject({ unreadable: true, mrzStatus: 'unsupported' });
  });
  it('cross-checks visible Chinese passport fields and returns the MRZ expiry date', () => {
    const lines = [
      line('Passport No. EA1234567'), line('Surname LI'), line('Given names WEI MING'),
      line('Date of expiry 01 JAN 2030'), line('Nationality CHINESE'), line('Country code CHN'),
      line('P<CHNLI<<WEI<MING'.padEnd(44, '<')),
      line('EA12345676CHN9001011M3001019<<<<<<<<<<<<<<04'),
    ];
    expect(extractKycFields({ front: lines, back: [] }, 'passport')).toMatchObject({
      expiryDate: '2030-01-01', visualComparisonStatus: 'consistent', visualMismatchFields: [],
    });
    const conflict = lines.map((item) => item.text === 'Passport No. EA1234567' ? line('Passport No. EA1234568') : item);
    expect(extractKycFields({ front: conflict, back: [] }, 'passport')).toMatchObject({
      visualComparisonStatus: 'conflict', visualMismatchFields: ['document_number'],
    });
  });
  it('uses the minimum mandatory field score and emits only allowed fields', () => {
    expect(extractKycFields({ front: [line('NAME: SYNTHETIC PERSON', 95), line('990101-14-0001', 62)], back: [] }, 'national_id'))
      .toEqual({ holderName: 'SYNTHETIC PERSON', documentNumber: '990101140001', confidence: 0.62, expiryDate: null, unreadable: false });
  });
  it('does not invent a field confidence when words have no score', () => {
    const result = toOcrLines({ blocks: [{ paragraphs: [{ lines: [{ text: 'NAME: TEST', words: [{ confidence: 91 }, {}] }] }] }] });
    expect(result).toEqual([line('NAME: TEST', null)]);
  });
  it('rejects oversized intermediate results rather than truncating candidates', () => {
    const data = { blocks: [{ paragraphs: [{ lines: Array.from({ length: 257 }, () => ({ text: 'sample', words: [] })) }] }] };
    expect(() => toOcrLines(data)).toThrow('invalid_response');
    expect(() => toOcrLines({ blocks: [{ paragraphs: [{ lines: [{ text: 'x'.repeat(513), words: [] }] }] }] })).toThrow('invalid_response');
  });
  it('maps real v7 hierarchy and rejects malformed output', () => {
    expect(toOcrLines({ blocks: null })).toEqual([]);
    expect(toOcrLines({ blocks: [{ paragraphs: [{ lines: [{ text: 'HELLO', words: [{ confidence: 89 }, { confidence: 70 }] }] }] }] })).toEqual([line('HELLO', 70)]);
    expect(() => toOcrLines({ blocks: 'private text' })).toThrow('invalid_response');
  });
  it('preserves bounded v7 line geometry and rejects missing, unordered or out-of-image boxes', () => {
    const data = { blocks: [{ paragraphs: [{ lines: [{ text: 'SYNTHETIC', bbox: { x0: 4, y0: 6, x1: 30, y1: 14 }, words: [{ confidence: 83 }] }] }] }] };
    expect(toOcrLayoutV1(data, { width: 100, height: 40 })).toEqual({ schemaVersion: 1, width: 100, height: 40,
      lines: [{ text: 'SYNTHETIC', confidence: 83, bbox: { x0: 4, y0: 6, x1: 30, y1: 14 } }] });
    expect(() => toOcrLayoutV1({ blocks: [{ paragraphs: [{ lines: [{ text: 'BAD', words: [] }] }] }] }, { width: 100, height: 40 })).toThrow('invalid_response');
    expect(() => toOcrLayoutV1({ blocks: [{ paragraphs: [{ lines: [{ text: 'BAD', bbox: { x0: 3, y0: 6, x1: 2, y1: 14 }, words: [] }] }] }] }, { width: 100, height: 40 })).toThrow('invalid_response');
    expect(() => toOcrLayoutV1({ blocks: [] }, { width: 5000, height: 5000 })).toThrow('invalid_response');
  });
  it('locates only a unique synthetic name and number inside the frozen manually aligned study regions', () => {
    const layout = { schemaVersion: 1 as const, width: 1000, height: 600, lines: [
      { text: '990101-14-0001', confidence: 90, bbox: { x0: 50, y0: 140, x1: 300, y1: 170 } },
      { text: 'A/L FICTIONAL PERSON', confidence: 90, bbox: { x0: 50, y0: 390, x1: 430, y1: 420 } },
      { text: 'TAMAN LARGE ADDRESS', confidence: 90, bbox: { x0: 50, y0: 500, x1: 430, y1: 530 } },
    ] };
    const options = { layout: 'mykad-front-reference-v1', alignment: 'manual-card-aligned' } as const;
    expect(extractMykadLayoutFieldsV1(layout, options)).toEqual({ holderName: 'A/L FICTIONAL PERSON', documentNumber: '990101140001', layoutStatus: 'located', unreadable: false });
    expect(extractMykadLayoutFieldsV1({ ...layout, lines: [...layout.lines, { ...layout.lines[1], text: 'SECOND CANDIDATE', bbox: { x0: 50, y0: 450, x1: 430, y1: 480 } }] }, options).holderName).toBeNull();
    expect(extractMykadLayoutFieldsV1({ ...layout, lines: [...layout.lines, { ...layout.lines[1], bbox: { x0: 50, y0: 450, x1: 430, y1: 480 } }] }, options).holderName).toBeNull();
    expect(extractMykadLayoutFieldsV1(layout, { ...options, alignment: 'unknown' } as never).layoutStatus).toBe('unknown');
    expect(extractMykadLayoutFieldsV1({ ...layout, lines: [...layout.lines, { ...layout.lines[0], text: '990101-14-0002', bbox: { x0: 330, y0: 140, x1: 580, y1: 170 } }] }, options).documentNumber).toBeNull();
    expect(extractMykadLayoutFieldsV1({ ...layout, lines: [{ ...layout.lines[1], text: 'X'.repeat(513) }] }, options).layoutStatus).toBe('unknown');
  });
  it('joins ordered name lines, preserves name particles and diacritics, and rejects separated candidates', () => {
    const layout = { schemaVersion: 1 as const, width: 1000, height: 600, lines: [
      { text: '990101-14-0001', confidence: 90, bbox: { x0: 50, y0: 140, x1: 300, y1: 170 } },
      { text: 'ÉMILIE D’ARC', confidence: 90, bbox: { x0: 52, y0: 416, x1: 260, y1: 438 } },
      { text: 'BINTI', confidence: 90, bbox: { x0: 50, y0: 390, x1: 140, y1: 410 } },
      { text: 'TAMAN LARGE ADDRESS', confidence: 90, bbox: { x0: 50, y0: 500, x1: 430, y1: 530 } },
    ] };
    const options = { layout: 'mykad-front-reference-v1', alignment: 'manual-card-aligned' } as const;
    expect(extractMykadLayoutFieldsV1(layout, options)).toMatchObject({ holderName: 'BINTI ÉMILIE D’ARC', documentNumber: '990101140001', layoutStatus: 'located' });
    const separated = { ...layout, lines: [...layout.lines, { text: 'A/P ANOTHER PERSON', confidence: 90, bbox: { x0: 55, y0: 460, x1: 330, y1: 482 } }] };
    expect(extractMykadLayoutFieldsV1(separated, options).holderName).toBeNull();
    const malformed = { ...layout, lines: [{ ...layout.lines[1], bbox: { ...layout.lines[1].bbox, x0: Number.NaN } }] };
    expect(extractMykadLayoutFieldsV1(malformed, options).layoutStatus).toBe('unknown');
  });
});
