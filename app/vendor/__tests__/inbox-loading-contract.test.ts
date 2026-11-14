import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const inboxSource = readFileSync(join(process.cwd(), 'app/vendor/inbox/page.tsx'), 'utf8');

describe('Vendor Inbox loading lifecycle', () => {
  it('uses the stable vendor ID rather than the rebuilt auth user object when loading threads', () => {
    expect(inboxSource).toContain("const vendorId = user?.activeVendorId;");
    expect(inboxSource).toContain("if (!vendorId) {");
    expect(inboxSource).toContain("if (showLoading) setLoading(false);");
    expect(inboxSource).toContain("}, [t, vendorId]);");
  });

  it('reconciles the inbox less often and only while visible', () => {
    expect(inboxSource).toContain('const INBOX_RECONCILE_POLL_MS = 15_000;');
    expect(inboxSource).toContain('document.visibilityState === \'visible\'');
    expect(inboxSource).toContain("document.addEventListener('visibilitychange', onVisibilityChange)");
  });

  it('prevents overlapping reads and keeps loaded threads after background failures', () => {
    expect(inboxSource).toContain('if (refreshRequest.current?.vendorId === vendorId) return;');
    expect(inboxSource).toContain('refreshRequest.current?.controller.abort();');
    expect(inboxSource).toContain('if (payload.error) {');
    expect(inboxSource).toContain('if (showLoading) {');
    expect(inboxSource).toContain('setThreads([]);');
  });
});

describe('Vendor Inbox realtime scope', () => {
  const subscriptions = inboxSource.match(/'postgres_changes',\s*\{[^}]*\}/g) || [];
  const subscriptionFor = (table: string) => subscriptions.filter((subscription) => subscription.includes(`table: '${table}'`));

  it('never subscribes to platform-wide chat rows', () => {
    expect(subscriptions.length).toBeGreaterThan(0);
    for (const subscription of subscriptions) expect(subscription).toContain('filter: `');
  });

  it('refreshes the thread list from the vendor threads', () => {
    expect(subscriptionFor('chat_threads')).toHaveLength(1);
    expect(subscriptionFor('chat_threads')[0]).toContain("event: 'UPDATE'");
    expect(subscriptionFor('chat_threads')[0]).toContain('filter: `vendor_id=eq.${vendorId');
  });

  it('streams messages and receipts only for the open conversation', () => {
    expect(subscriptionFor('chat_messages')).toHaveLength(1);
    expect(subscriptionFor('chat_messages')[0]).toContain('filter: `thread_id=eq.${active');
    for (const table of ['chat_message_reads', 'chat_message_deliveries']) {
      expect(subscriptionFor(table)).toHaveLength(1);
      expect(subscriptionFor(table)[0]).toContain('filter: `user_id=eq.${activeCustomerId');
    }
  });
});
