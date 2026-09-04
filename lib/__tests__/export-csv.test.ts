import { describe, expect, it } from 'vitest';
import { formatCsvCell, generateCsvContent, type CsvColumn } from '../export-csv';

describe('export-csv', () => {
  describe('formatCsvCell', () => {
    it('wraps string in quotes and handles null/undefined', () => {
      expect(formatCsvCell('hello')).toBe('"hello"');
      expect(formatCsvCell(null)).toBe('""');
      expect(formatCsvCell(undefined)).toBe('""');
      expect(formatCsvCell(123)).toBe('"123"');
    });

    it('escapes internal double quotes by doubling them', () => {
      expect(formatCsvCell('John "The Boss" Doe')).toBe('"John ""The Boss"" Doe"');
    });
  });

  describe('generateCsvContent', () => {
    interface SampleData {
      id: string;
      name: string;
      amount: number;
    }

    const columns: CsvColumn<SampleData>[] = [
      { header: 'ID', accessor: (d) => d.id },
      { header: 'Name', accessor: (d) => d.name },
      { header: 'Amount (RM)', accessor: (d) => d.amount },
    ];

    it('generates properly formatted CSV with UTF-8 BOM', () => {
      const data: SampleData[] = [
        { id: '1', name: 'Penang Tour', amount: 50 },
        { id: '2', name: 'Melaka Cruise', amount: 35.5 },
      ];

      const csv = generateCsvContent(columns, data);

      expect(csv.startsWith('\uFEFF')).toBe(true);
      const rows = csv.replace('\uFEFF', '').split('\r\n');
      expect(rows[0]).toBe('"ID","Name","Amount (RM)"');
      expect(rows[1]).toBe('"1","Penang Tour","50"');
      expect(rows[2]).toBe('"2","Melaka Cruise","35.5"');
    });
  });
});
