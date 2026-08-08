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
const FLAG_TYPE_LABEL: Record<string, string> = {
  self_referral: 'Self-referral',
  duplicate_attribution: 'Duplicate payout attempt',
  expired_attribution: 'Expired attribution window',
  click_velocity: 'Click velocity spike',
  visitor_clustering: 'Clicks clustered on one visitor',
  zero_conversion: 'Many clicks, zero referrals',
  click_cap_reached: 'Limited-tier monthly click cap reached',
  vendor_ineligible: 'Vendor/outlet manager ineligible for commission',
};

const PAGE_MARGIN = 50;
const CONTENT_WIDTH = 495; // A4 (595.28pt) minus 2*50 margin, rounded down

function formatMYR(amount: number): string {
  return `RM ${amount.toFixed(2)}`;
}

function formatPercent(rate: number): string {
  return `${Number((rate * 100).toFixed(2))}%`;
}

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function isoDate(value: string): string {
  return value.slice(0, 10);
}

function rangeLabel(range: FraudAnalyticsRange): string {
  return range === 'all' ? 'All time' : range.toUpperCase();
}

function ensureSpace(doc: PDFKit.PDFDocument, needed: number): void {
  const pageBottom = doc.page.height - doc.page.margins.bottom;
  if (doc.y + needed > pageBottom) doc.addPage();
}

function sectionTitle(doc: PDFKit.PDFDocument, title: string): void {
  ensureSpace(doc, 30);
  doc.fontSize(11).font('Helvetica-Bold').fillColor('#010066').text(title);
  doc.fillColor('#000000');
  doc.moveDown(0.3);
}

/** Fixed-width label/value cards laid out in a row, e.g. the "totals" strip. */
function keyValueRow(doc: PDFKit.PDFDocument, pairs: [string, string][]): void {
  ensureSpace(doc, 34);
  const colWidth = CONTENT_WIDTH / pairs.length;
  const labelY = doc.y;
  doc.fontSize(8).font('Helvetica').fillColor('#666666');
  pairs.forEach(([label], i) => doc.text(label, PAGE_MARGIN + i * colWidth, labelY, { width: colWidth - 10 }));
  const valueY = labelY + 12;
  doc.fontSize(13).font('Helvetica-Bold').fillColor('#000000');
  pairs.forEach(([, value], i) => doc.text(value, PAGE_MARGIN + i * colWidth, valueY, { width: colWidth - 10 }));
  doc.y = valueY + 20;
}

interface TableColumn {
  header: string;
  width: number;
  align?: 'left' | 'right';
}

function table(doc: PDFKit.PDFDocument, columns: TableColumn[], rows: string[][]): void {
  ensureSpace(doc, 24);
  const totalWidth = columns.reduce((sum, c) => sum + c.width, 0);

  let x = PAGE_MARGIN;
  const headerY = doc.y;
  doc.fontSize(8).font('Helvetica-Bold').fillColor('#374151');
  for (const col of columns) {
    doc.text(col.header, x, headerY, { width: col.width, align: col.align ?? 'left' });
    x += col.width;
  }
  doc.y = headerY + 12;
  doc.strokeColor('#e5e7eb').moveTo(PAGE_MARGIN, doc.y).lineTo(PAGE_MARGIN + totalWidth, doc.y).stroke();
  doc.strokeColor('#000000');
  doc.moveDown(0.25);

  doc.font('Helvetica').fontSize(8).fillColor('#111827');
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

export function generateAffiliateReportPdf(data: AffiliateReportData): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: PAGE_MARGIN, size: 'A4' });
    const chunks: Buffer[] = [];

    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    // Header
    doc.fontSize(20).font('Helvetica-Bold').text('MyWisata Malaysia', { align: 'center' });
    doc.fontSize(11).font('Helvetica').text('Affiliate Program Report', { align: 'center' });
    doc
      .fontSize(9)
      .fillColor('#888888')
      .text(
        `Generated ${new Date(data.generatedAt).toLocaleString('en-MY', { timeZone: 'Asia/Kuala_Lumpur' })} · Fraud window: ${rangeLabel(data.fraudAnalytics.range)}`,
        { align: 'center' },
      );
    doc.fillColor('#000000');
    doc.moveDown(0.5);
    doc.moveTo(PAGE_MARGIN, doc.y).lineTo(PAGE_MARGIN + CONTENT_WIDTH, doc.y).stroke();
    doc.moveDown(0.6);

    // Program totals
    sectionTitle(doc, 'Program Totals');
    keyValueRow(doc, [
      ['Affiliates', String(data.stats.totals.totalAffiliates)],
      ['Clicks', String(data.stats.totals.totalClicks)],
      ['Referrals', String(data.stats.totals.totalReferrals)],
      ['Commission committed', formatMYR(data.stats.totals.totalCommission)],
    ]);
    doc.moveDown(0.4);

    // Commission tiers
    sectionTitle(doc, 'Commission Tiers');
    table(
      doc,
      [
        { header: 'Tier', width: 150 },
        { header: 'Rate', width: 150 },
        { header: 'Min Referrals', width: 195 },
      ],
      data.stats.tiers.map((tier) => [capitalize(tier.tierName), formatPercent(tier.rate), String(tier.minReferrals)]),
    );
    doc.moveDown(0.5);

    // Top earners
    sectionTitle(doc, 'Top Earners');
    if (data.stats.topEarners.length === 0) {
      doc.fontSize(9).font('Helvetica').fillColor('#666666').text('No commissions earned yet.');
      doc.fillColor('#000000');
      doc.moveDown(0.3);
    } else {
      table(
        doc,
        [
          { header: '#', width: 25 },
          { header: 'Affiliate', width: 165 },
          { header: 'Code', width: 90 },
          { header: 'Tier', width: 75 },
          { header: 'Referrals', width: 60, align: 'right' },
          { header: 'Commission', width: 80, align: 'right' },
        ],
        data.stats.topEarners.map((e, i) => [
          String(i + 1),
          e.userName,
          e.affiliateCode,
          capitalize(e.tierName),
          String(e.referrals),
          formatMYR(e.commission),
        ]),
      );
      doc.moveDown(0.5);
    }

    // Fraud guards
    sectionTitle(doc, 'Fraud Guards');
    keyValueRow(doc, [
      ['Self-referrals blocked', String(data.fraudCounters.selfReferralsBlocked)],
      ['Duplicate payouts prevented', String(data.fraudCounters.duplicatePayoutsPrevented)],
      ['Open flags', String(data.fraudCounters.openFlags)],
      ['Links currently disabled', String(data.fraudCounters.linksDisabled)],
    ]);
    doc.moveDown(0.4);

    // Fraud breakdown (range-scoped, matches the dashboard's toggle)
    sectionTitle(doc, `Fraud Breakdown — ${rangeLabel(data.fraudAnalytics.range)}`);
    table(
      doc,
      [
        { header: 'Flag Type', width: 350 },
        { header: 'Count', width: 145, align: 'right' },
      ],
      data.fraudAnalytics.byType.map((x) => [FLAG_TYPE_LABEL[x.flagType] ?? x.flagType, String(x.count)]),
    );
    doc.moveDown(0.3);
    table(
      doc,
      [
        { header: 'Severity', width: 350 },
        { header: 'Count', width: 145, align: 'right' },
      ],
      data.fraudAnalytics.bySeverity.map((x) => [capitalize(x.severity), String(x.count)]),
    );
    doc.moveDown(0.5);

    // Top flagged affiliates
    sectionTitle(doc, 'Top Flagged Affiliates');
    if (data.fraudAnalytics.topFlaggedAffiliates.length === 0) {
      doc.fontSize(9).font('Helvetica').fillColor('#666666').text('No flags in this range.');
      doc.fillColor('#000000');
      doc.moveDown(0.3);
    } else {
      table(
        doc,
        [
          { header: 'Affiliate', width: 250 },
          { header: 'Code', width: 120 },
          { header: 'Flags', width: 125, align: 'right' },
        ],
        data.fraudAnalytics.topFlaggedAffiliates.map((a) => [a.userName, a.affiliateCode ?? '—', String(a.flagCount)]),
      );
    }

    // Attributions — own page: this is the largest, most-likely-to-overflow
    // table, so it starts fresh rather than splitting awkwardly mid-section.
    doc.addPage();
    const attributions = data.stats.attributions.slice(0, ATTRIBUTIONS_LIMIT);
    const truncated = data.stats.attributions.length > ATTRIBUTIONS_LIMIT;
    sectionTitle(
      doc,
      truncated
        ? `Attributions (most recent ${ATTRIBUTIONS_LIMIT} of ${data.stats.attributions.length})`
        : `Attributions (${data.stats.attributions.length})`,
    );
    if (attributions.length === 0) {
      doc.fontSize(9).font('Helvetica').fillColor('#666666').text('No attributions yet.');
      doc.fillColor('#000000');
    } else {
      table(
        doc,
        [
          { header: 'User', width: 140 },
          { header: 'Activity', width: 140 },
          { header: 'Date', width: 70 },
          { header: 'Status', width: 65 },
          { header: 'Commission', width: 80, align: 'right' },
        ],
        attributions.map((a) => [
          a.userName,
          a.productName ?? '—',
          isoDate(a.createdAt),
          capitalize(a.status),
          formatMYR(a.commissionAmount),
        ]),
      );
    }

    doc.moveDown(1);
    doc.fontSize(8).font('Helvetica').fillColor('#888888').text('MyWisata Malaysia — internal admin report.', { align: 'center' });

    doc.end();
  });
}
