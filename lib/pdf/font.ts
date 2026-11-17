import path from 'node:path';

const CJK_TEXT = /[\u2e80-\u9fff\uf900-\ufaff]/u;

export function registerPdfFonts(
  doc: PDFKit.PDFDocument,
  content: string,
  prefix: string,
) {
  // Labels are English; user-entered names may still be Chinese, so embed the CJK font only then.
  const cjk = CJK_TEXT.test(content);
  if (!cjk) return { regular: 'Helvetica', bold: 'Helvetica-Bold' };
  const regular = `${prefix}CJK`;
  doc.registerFont(regular, path.join(process.cwd(), 'lib/pdf/fonts/NotoSansCJKsc-Regular.otf'));
  return { regular, bold: regular };
}
