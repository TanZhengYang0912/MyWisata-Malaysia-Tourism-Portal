import { describe, expect, it } from 'vitest';
import { supportQueueQuery } from '../support-queue';

describe('supportQueueQuery', () => {
  it('applies bounded queue defaults and keeps search trimmed', () => {
    const result = supportQueueQuery(new Request('http://localhost/api/admin/tickets?search=%20refund%20'));

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toEqual({
        page: 1,
        category: 'all',
        status: 'all',
        assignedToMe: false,
        unreadOnly: false,
        search: 'refund',
        sort: 'default',
      });
    }
  });

  it('rejects unsupported filters and out-of-range pages', () => {
    expect(supportQueueQuery(new Request('http://localhost/api/admin/tickets?page=0')).success).toBe(false);
    expect(supportQueueQuery(new Request('http://localhost/api/admin/tickets?status=deleted')).success).toBe(false);
    expect(supportQueueQuery(new Request('http://localhost/api/admin/tickets?search=' + 'x'.repeat(201))).success).toBe(false);
  });
});
