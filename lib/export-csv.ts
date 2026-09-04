/**
 * Utility to format and trigger a client-side CSV file download in the browser.
 * Adds a UTF-8 BOM so Microsoft Excel and other spreadsheet tools correctly render international characters.
 */

export interface CsvColumn<T> {
  header: string;
  accessor: (item: T) => string | number | boolean | null | undefined;
}

export function formatCsvCell(value: unknown): string {
  if (value === null || value === undefined) {
    return '""';
  }
  const str = String(value);
  // Escape double quotes by doubling them
  const escaped = str.replace(/"/g, '""');
  return `"${escaped}"`;
}

export function generateCsvContent<T>(columns: CsvColumn<T>[], items: T[]): string {
  const headerRow = columns.map((col) => formatCsvCell(col.header)).join(',');
  const dataRows = items.map((item) =>
    columns.map((col) => formatCsvCell(col.accessor(item))).join(',')
  );

  return '\uFEFF' + [headerRow, ...dataRows].join('\r\n');
}

export function downloadCsvFile(filename: string, content: string): void {
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', filename.endsWith('.csv') ? filename : `${filename}.csv`);
  link.style.visibility = 'hidden';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export function exportToCsv<T>(filename: string, columns: CsvColumn<T>[], items: T[]): void {
  const csvContent = generateCsvContent(columns, items);
  downloadCsvFile(filename, csvContent);
}
