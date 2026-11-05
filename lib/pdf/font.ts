import path from 'node:path';
import type { AppLocale } from '@/lib/i18n/locale';

const CJK_TEXT = /[\u2e80-\u9fff\uf900-\ufaff]/u;

export function registerPdfFonts(
  doc: PDFKit.PDFDocument,
  locale: AppLocale,
  content: string,
  prefix: string,
) {
  const cjk = locale === 'zh-CN' || CJK_TEXT.test(content);
  if (!cjk) return { regular: 'Helvetica', bold: 'Helvetica-Bold' };
  const regular = `${prefix}CJK`;
  doc.registerFont(regular, path.join(process.cwd(), 'lib/pdf/fonts/NotoSansCJKsc-Regular.otf'));
  return { regular, bold: regular };
}
