// P4 — Member 4: admin-side affiliate PDF export.
// Renders the same data app/admin/affiliate/page.tsx shows (program totals,
// commission tiers, top earners, fraud guard counters/breakdown, top
// flagged affiliates, attributions) into a single downloadable PDF —
// pdfkit, same library/Buffer-promise shape as lib/pdf/receipt.ts (this
// codebase's only other PDF generator), not a new dependency.

import PDFDocument from 'pdfkit';
import type { AffiliateAdminStats } from '@/lib/affiliate/admin-stats';
import type { FraudCounters } from '@/lib/affiliate/fraud';
import type { FraudAnalytics, FraudAnalyticsRange } from '@/lib/affiliate/fraud-analytics';
import { formatDate, formatDateTime, formatMYR, formatNumber } from '@/lib/i18n/format';
import type { AppLocale } from '@/lib/i18n/locale';
import { registerPdfFonts } from '@/lib/pdf/font';

export interface AffiliateReportData {
  generatedAt: string; // ISO
  stats: AffiliateAdminStats;
  fraudCounters: FraudCounters;
  fraudAnalytics: FraudAnalytics;
}

// Bounds the PDF's size regardless of how much history the platform has
// accumulated — the on-page table has no such cap (it's paginated/scrolled
// in the browser instead), so a report with more rows than this notes the
// truncation rather than silently dropping data.
const ATTRIBUTIONS_LIMIT = 150;

// Local copy of the flag-type labels, same as the two existing copies in
// app/admin/affiliate/page.tsx and components/shared/fraud-breakdown-charts.tsx
// (this codebase's established pattern for this small, rarely-changing map —
// see MEMORY/session notes; not worth a shared-import refactor for 8 entries).
const FLAG_TYPE_LABEL: Record<AppLocale, Record<string, string>> = {
  en: {
    self_referral: 'Self-referral',
    duplicate_attribution: 'Duplicate payout attempt',
    expired_attribution: 'Expired attribution window',
    click_velocity: 'Click velocity spike',
    visitor_clustering: 'Clicks clustered on one visitor',
    zero_conversion: 'Many clicks, zero referrals',
    click_cap_reached: 'Limited-tier monthly click cap reached',
    vendor_ineligible: 'Vendor/outlet manager ineligible for commission',
  },
  'zh-CN': {
    self_referral: '自我推荐', duplicate_attribution: '重复支付尝试', expired_attribution: '归因期限已过',
    click_velocity: '点击量短时激增', visitor_clustering: '点击集中于单一访客', zero_conversion: '点击较多但无推荐转化',
    click_cap_reached: '受限等级月度点击上限已达', vendor_ineligible: '商家或门店经理不符合佣金资格',
  },
  ms: {
    self_referral: 'Rujukan kendiri', duplicate_attribution: 'Percubaan bayaran pendua', expired_attribution: 'Tempoh atribusi tamat',
    click_velocity: 'Lonjakan kadar klik', visitor_clustering: 'Klik tertumpu pada seorang pelawat', zero_conversion: 'Banyak klik, tiada rujukan',
    click_cap_reached: 'Had klik bulanan tahap terhad dicapai', vendor_ineligible: 'Vendor/pengurus outlet tidak layak menerima komisen',
  },
};

const REPORT_COPY: Record<AppLocale, Record<string, string>> = {
  en: {},
  'zh-CN': {
    title: '推广计划报告', totals: '计划汇总', affiliates: '推广用户', clicks: '点击量', referrals: '推荐量', committed: '已承诺佣金',
    tiers: '佣金等级', tier: '等级', rate: '比例', minReferrals: '最低推荐数', earners: '佣金排名', affiliate: '推广用户',
    code: '代码', commission: '佣金', noCommissions: '暂无已赚取佣金。', fraudGuards: '风险防护', selfReferrals: '已拦截自我推荐',
    duplicatePayouts: '已阻止重复支付', openFlags: '待处理标记', disabledLinks: '当前已停用链接', breakdown: '风险明细', flagType: '标记类型',
    count: '数量', severity: '严重程度', flagged: '风险标记较多的推广用户', noFlags: '此范围内没有风险标记。', flags: '标记数',
    attributions: '推广归因', user: '用户', activity: '活动', date: '日期', status: '状态', noAttributions: '暂无推广归因记录。',
    attributionCount: '共 {count} 条', attributionRecent: '最近 {shown} 条，共 {count} 条',
    footer: 'MYLawatan Malaysia — 管理员内部报告。', range7d: '7 天', range30d: '30 天', range90d: '90 天',
    pending: '待处理', released: '已发放', rejected: '已拒绝', low: '低', medium: '中', high: '高', standard: '标准', active: '活跃', top: '顶级',
  },
  ms: {
    title: 'Laporan Program Afiliasi', totals: 'Jumlah Program', affiliates: 'Rakan afiliasi', clicks: 'Klik', referrals: 'Rujukan', committed: 'Komisen diperuntukkan',
    tiers: 'Tahap Komisen', tier: 'Tahap', rate: 'Kadar', minReferrals: 'Rujukan minimum', earners: 'Penerima komisen tertinggi', affiliate: 'Rakan afiliasi',
    code: 'Kod', commission: 'Komisen', noCommissions: 'Belum ada komisen diperoleh.', fraudGuards: 'Kawalan risiko', selfReferrals: 'Rujukan kendiri disekat',
    duplicatePayouts: 'Bayaran pendua dicegah', openFlags: 'Tanda terbuka', disabledLinks: 'Pautan yang dinyahaktifkan', breakdown: 'Pecahan risiko', flagType: 'Jenis tanda',
    count: 'Bilangan', severity: 'Tahap risiko', flagged: 'Rakan afiliasi dengan tanda tertinggi', noFlags: 'Tiada tanda dalam tempoh ini.', flags: 'Tanda',
    attributions: 'Atribusi', user: 'Pengguna', activity: 'Aktiviti', date: 'Tarikh', status: 'Status', noAttributions: 'Belum ada atribusi.',
    attributionCount: '{count} rekod', attributionRecent: '{shown} terkini daripada {count} rekod',
    footer: 'MYLawatan Malaysia — laporan dalaman pentadbir.', range7d: '7 hari', range30d: '30 hari', range90d: '90 hari',
    pending: 'Belum selesai', released: 'Dikeluarkan', rejected: 'Ditolak', low: 'Rendah', medium: 'Sederhana', high: 'Tinggi', standard: 'Standard', active: 'Aktif', top: 'Tertinggi',
  },
};

const PAGE_MARGIN = 50;
const CONTENT_WIDTH = 495; // A4 (595.28pt) minus 2*50 margin, rounded down

function formatPercent(rate: number): string {
  return `${Number((rate * 100).toFixed(2))}%`;
}

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function rangeLabel(range: FraudAnalyticsRange, copy: Record<string, string>): string {
  return copy[`range${range}`] ?? range.toUpperCase();
}

function ensureSpace(doc: PDFKit.PDFDocument, needed: number): void {
  const pageBottom = doc.page.height - doc.page.margins.bottom;
  if (doc.y + needed > pageBottom) doc.addPage();
}

function sectionTitle(doc: PDFKit.PDFDocument, title: string, bold = 'Helvetica-Bold'): void {
  ensureSpace(doc, 30);
  doc.fontSize(11).font(bold).fillColor('#010066').text(title, PAGE_MARGIN, doc.y, { width: CONTENT_WIDTH });
  doc.fillColor('#000000');
  doc.moveDown(0.3);
}

/** Fixed-width label/value cards laid out in a row, e.g. the "totals" strip. */
function keyValueRow(doc: PDFKit.PDFDocument, pairs: [string, string][], regular = 'Helvetica', bold = 'Helvetica-Bold'): void {
  ensureSpace(doc, 34);
  const colWidth = CONTENT_WIDTH / pairs.length;
  const labelY = doc.y;
  doc.fontSize(8).font(regular).fillColor('#666666');
  pairs.forEach(([label], i) => doc.text(label, PAGE_MARGIN + i * colWidth, labelY, { width: colWidth - 10 }));
  const valueY = labelY + 12;
  doc.fontSize(13).font(bold).fillColor('#000000');
  pairs.forEach(([, value], i) => doc.text(value, PAGE_MARGIN + i * colWidth, valueY, { width: colWidth - 10 }));
  doc.y = valueY + 20;
}

interface TableColumn {
  header: string;
  width: number;
  align?: 'left' | 'right';
}

function table(doc: PDFKit.PDFDocument, columns: TableColumn[], rows: string[][], regular = 'Helvetica', bold = 'Helvetica-Bold'): void {
  ensureSpace(doc, 24);
  const totalWidth = columns.reduce((sum, c) => sum + c.width, 0);

  let x = PAGE_MARGIN;
  const headerY = doc.y;
  doc.fontSize(8).font(bold).fillColor('#374151');
  for (const col of columns) {
    doc.text(col.header, x, headerY, { width: col.width, align: col.align ?? 'left' });
    x += col.width;
  }
  doc.y = headerY + 12;
  doc.strokeColor('#e5e7eb').moveTo(PAGE_MARGIN, doc.y).lineTo(PAGE_MARGIN + totalWidth, doc.y).stroke();
  doc.strokeColor('#000000');
  doc.moveDown(0.25);

  doc.font(regular).fontSize(8).fillColor('#111827');
  for (const row of rows) {
    ensureSpace(doc, 16);
    x = PAGE_MARGIN;
    const rowY = doc.y;
    let rowHeight = 0;
    row.forEach((cell, i) => {
      doc.text(cell, x, rowY, { width: columns[i].width, align: columns[i].align ?? 'left' });
      rowHeight = Math.max(rowHeight, doc.y - rowY);
      x += columns[i].width;
    });
    doc.y = rowY + Math.max(rowHeight, 11);
  }
  doc.fillColor('#000000');
}

export function generateAffiliateReportPdf(data: AffiliateReportData, locale: AppLocale = 'en'): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: PAGE_MARGIN, size: 'A4' });
    const copy = REPORT_COPY[locale];
    const fonts = registerPdfFonts(doc, locale, JSON.stringify(data) + JSON.stringify(copy), 'AffiliateReport');
    const label = (key: string, fallback: string) => copy[key] ?? fallback;
    const chunks: Buffer[] = [];

    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    // Header
    doc.fontSize(20).font(fonts.bold).text('MYLawatan Malaysia', { align: 'center' });
    doc.fontSize(11).font(fonts.regular).text(copy.title || 'Affiliate Program Report', { align: 'center' });
    doc
      .fontSize(9)
      .fillColor('#888888')
      .text(
        locale === 'en'
          ? `Generated ${formatDateTime(data.generatedAt, locale, { timeZone: 'Asia/Kuala_Lumpur' })} · Fraud window: ${rangeLabel(data.fraudAnalytics.range, copy)}`
          : `${locale === 'zh-CN' ? '生成时间' : 'Dijana pada'} ${formatDateTime(data.generatedAt, locale, { timeZone: 'Asia/Kuala_Lumpur' })} · ${locale === 'zh-CN' ? '风险统计范围' : 'Tempoh risiko'}: ${rangeLabel(data.fraudAnalytics.range, copy)}`,
        { align: 'center' },
      );
    doc.fillColor('#000000');
    doc.moveDown(0.5);
    doc.moveTo(PAGE_MARGIN, doc.y).lineTo(PAGE_MARGIN + CONTENT_WIDTH, doc.y).stroke();
    doc.moveDown(0.6);

    // Program totals
    sectionTitle(doc, copy.totals || 'Program Totals', fonts.bold);
    keyValueRow(doc, [
      [copy.affiliates || 'Affiliates', formatNumber(data.stats.totals.totalAffiliates, locale)],
      [copy.clicks || 'Clicks', formatNumber(data.stats.totals.totalClicks, locale)],
      [copy.referrals || 'Referrals', formatNumber(data.stats.totals.totalReferrals, locale)],
      [copy.committed || 'Commission committed', formatMYR(data.stats.totals.totalCommission, locale)],
    ], fonts.regular, fonts.bold);
    doc.moveDown(0.4);

    // Commission tiers
    sectionTitle(doc, copy.tiers || 'Commission Tiers', fonts.bold);
    table(
      doc,
      [
        { header: copy.tier || 'Tier', width: 150 },
        { header: copy.rate || 'Rate', width: 150 },
        { header: copy.minReferrals || 'Min Referrals', width: 195 },
      ],
      data.stats.tiers.map((tier) => [copy[tier.tierName.toLowerCase()] || capitalize(tier.tierName), formatPercent(tier.rate), formatNumber(tier.minReferrals, locale)]), fonts.regular, fonts.bold,
    );
    doc.moveDown(0.5);

    // Top earners
    sectionTitle(doc, label('earners', 'Top Earners'), fonts.bold);
    if (data.stats.topEarners.length === 0) {
      doc.fontSize(9).font(fonts.regular).fillColor('#666666').text(label('noCommissions', 'No commissions earned yet.'), PAGE_MARGIN, doc.y, { width: CONTENT_WIDTH });
      doc.fillColor('#000000');
      doc.moveDown(0.3);
    } else {
      table(
        doc,
        [
          { header: '#', width: 25 },
          { header: label('affiliate', 'Affiliate'), width: 165 },
          { header: label('code', 'Code'), width: 90 },
          { header: label('tier', 'Tier'), width: 75 },
          { header: label('referrals', 'Referrals'), width: 60, align: 'right' },
          { header: label('commission', 'Commission'), width: 80, align: 'right' },
        ],
        data.stats.topEarners.map((e, i) => [
          String(i + 1),
          e.userName,
          e.affiliateCode,
          copy[e.tierName.toLowerCase()] || capitalize(e.tierName),
          formatNumber(e.referrals, locale),
          formatMYR(e.commission, locale),
        ]), fonts.regular, fonts.bold,
      );
      doc.moveDown(0.5);
    }

    // Fraud guards
    sectionTitle(doc, label('fraudGuards', 'Fraud Guards'), fonts.bold);
    keyValueRow(doc, [
      [label('selfReferrals', 'Self-referrals blocked'), formatNumber(data.fraudCounters.selfReferralsBlocked, locale)],
      [label('duplicatePayouts', 'Duplicate payouts prevented'), formatNumber(data.fraudCounters.duplicatePayoutsPrevented, locale)],
      [label('openFlags', 'Open flags'), formatNumber(data.fraudCounters.openFlags, locale)],
      [label('disabledLinks', 'Links currently disabled'), formatNumber(data.fraudCounters.linksDisabled, locale)],
    ], fonts.regular, fonts.bold);
    doc.moveDown(0.4);

    // Fraud breakdown (range-scoped, matches the dashboard's toggle)
    sectionTitle(doc, `${label('breakdown', 'Fraud Breakdown')} — ${rangeLabel(data.fraudAnalytics.range, copy)}`, fonts.bold);
    table(
      doc,
      [
        { header: label('flagType', 'Flag Type'), width: 350 },
        { header: label('count', 'Count'), width: 145, align: 'right' },
      ],
      data.fraudAnalytics.byType.map((x) => [FLAG_TYPE_LABEL[locale][x.flagType] ?? x.flagType, formatNumber(x.count, locale)]), fonts.regular, fonts.bold,
    );
    doc.moveDown(0.3);
    table(
      doc,
      [
        { header: label('severity', 'Severity'), width: 350 },
        { header: label('count', 'Count'), width: 145, align: 'right' },
      ],
      data.fraudAnalytics.bySeverity.map((x) => [copy[x.severity] || capitalize(x.severity), formatNumber(x.count, locale)]), fonts.regular, fonts.bold,
    );
    doc.moveDown(0.5);

    // Top flagged affiliates
    sectionTitle(doc, label('flagged', 'Top Flagged Affiliates'), fonts.bold);
    if (data.fraudAnalytics.topFlaggedAffiliates.length === 0) {
      doc.fontSize(9).font(fonts.regular).fillColor('#666666').text(label('noFlags', 'No flags in this range.'), PAGE_MARGIN, doc.y, { width: CONTENT_WIDTH });
      doc.fillColor('#000000');
      doc.moveDown(0.3);
    } else {
      table(
        doc,
        [
          { header: label('affiliate', 'Affiliate'), width: 250 },
          { header: label('code', 'Code'), width: 120 },
          { header: label('flags', 'Flags'), width: 125, align: 'right' },
        ],
        data.fraudAnalytics.topFlaggedAffiliates.map((a) => [a.userName, a.affiliateCode ?? '—', formatNumber(a.flagCount, locale)]), fonts.regular, fonts.bold,
      );
    }

    // Attributions — own page: this is the largest, most-likely-to-overflow
    // table, so it starts fresh rather than splitting awkwardly mid-section.
    doc.addPage();
    const attributions = data.stats.attributions.slice(0, ATTRIBUTIONS_LIMIT);
    const truncated = data.stats.attributionTotalCount > attributions.length;
    sectionTitle(
      doc,
      truncated
      ? `${label('attributions', 'Attributions')} (${copy.attributionRecent?.replace('{shown}', formatNumber(attributions.length, locale)).replace('{count}', formatNumber(data.stats.attributionTotalCount, locale)) ?? `${formatNumber(attributions.length, locale)} of ${formatNumber(data.stats.attributionTotalCount, locale)}`})`
        : `${label('attributions', 'Attributions')} (${copy.attributionCount?.replace('{count}', formatNumber(data.stats.attributionTotalCount, locale)) ?? formatNumber(data.stats.attributionTotalCount, locale)})`, fonts.bold,
    );
    if (attributions.length === 0) {
      doc.fontSize(9).font(fonts.regular).fillColor('#666666').text(label('noAttributions', 'No attributions yet.'), PAGE_MARGIN, doc.y, { width: CONTENT_WIDTH });
      doc.fillColor('#000000');
    } else {
      table(
        doc,
        [
          { header: label('user', 'User'), width: 140 },
          { header: label('activity', 'Activity'), width: 140 },
          { header: label('date', 'Date'), width: 70 },
          { header: label('status', 'Status'), width: 65 },
          { header: label('commission', 'Commission'), width: 80, align: 'right' },
        ],
        attributions.map((a) => [
          a.userName,
          a.productName ?? '—',
          formatDate(a.createdAt, locale, { timeZone: 'Asia/Kuala_Lumpur' }),
          copy[a.status.toLowerCase()] || capitalize(a.status),
          formatMYR(a.commissionAmount, locale),
        ]), fonts.regular, fonts.bold,
      );
    }

    doc.moveDown(1);
    doc.fontSize(8).font(fonts.regular).fillColor('#888888').text(label('footer', 'MYLawatan Malaysia — internal admin report.'), PAGE_MARGIN, doc.y, { width: CONTENT_WIDTH, align: 'center' });

    doc.end();
  });
}
