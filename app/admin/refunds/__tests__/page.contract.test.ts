import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const pageSource = readFileSync(resolve(process.cwd(), 'app/admin/refunds/page.tsx'), 'utf8');
const layoutSource = readFileSync(resolve(process.cwd(), 'app/admin/layout.tsx'), 'utf8');

describe('admin refund simulator UI', () => {
  it('labels simulated flows and exposes governed refund actions', () => {
    expect(pageSource).toContain('t("refunds.header.title")');
    expect(pageSource).toContain('t("refunds.sandbox.label")');
    expect(pageSource).toContain('t("refunds.actions.approve")');
    expect(pageSource).toContain('t("refunds.actions.reject")');
    expect(pageSource).toContain('t("refunds.actions.simulateSuccess")');
    expect(pageSource).toContain('t("refunds.actions.simulateRetryableFailure")');
    expect(pageSource).toContain('/api/admin/refunds');
    expect(pageSource).toContain('/api/payments/simulator/refunds/');
  });

  it('adds the refund queue to the admin navigation', () => {
    expect(layoutSource).toContain('href: "/admin/refunds"');
    expect(layoutSource).toContain('label: "Refunds"');
  });

  it('keeps failure codes and messages visible in refund rows', () => {
    expect(pageSource).toContain('refund.failureCode && (');
    expect(pageSource).toContain('{refund.failureCode}');
    expect(pageSource).toContain('{refund.failureMessage}');
    expect(pageSource).toContain('aria-label={refund.failureMessage}');
  });
});
