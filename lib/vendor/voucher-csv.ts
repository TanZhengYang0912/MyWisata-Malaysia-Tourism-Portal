export function parseVoucherCsv(source: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;

  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];
    const next = source[index + 1];
    if (char === '"' && quoted && next === '"') {
      cell += '"';
      index += 1;
      continue;
    }
    if (char === '"') {
      quoted = !quoted;
      continue;
    }
    if (char === ',' && !quoted) {
      row.push(cell.trim());
      cell = '';
      continue;
    }
    if ((char === '\n' || char === '\r') && !quoted) {
      if (char === '\r' && next === '\n') index += 1;
      row.push(cell.trim());
      cell = '';
      if (row.some(Boolean)) rows.push(row);
      row = [];
      continue;
    }
    cell += char;
  }

  row.push(cell.trim());
  if (row.some(Boolean)) rows.push(row);
  return rows;
}

export function makeVoucherCode(prefix: string, sequence: number): string {
  const normalizedPrefix = prefix.trim().toUpperCase();
  if (!/^[A-Z0-9]{2,20}$/.test(normalizedPrefix)) throw new Error('Voucher code prefix must contain 2-20 letters or numbers.');
  if (!Number.isInteger(sequence) || sequence < 1) throw new Error('Voucher code sequence must be a positive integer.');
  return `${normalizedPrefix}${String(sequence).padStart(3, '0')}`;
}

export function allocateVoucherCodes(prefix: string, count: number, usedCodes: ReadonlySet<string>, startSequence = 1): string[] {
  const occupied = new Set(Array.from(usedCodes, (code) => code.toUpperCase()));
  const result: string[] = [];
  let sequence = startSequence;
  while (result.length < count) {
    const code = makeVoucherCode(prefix, sequence);
    sequence += 1;
    if (occupied.has(code)) continue;
    occupied.add(code);
    result.push(code);
  }
  return result;
}
