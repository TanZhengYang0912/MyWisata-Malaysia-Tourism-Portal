import { describe, expect, it } from 'vitest';
import { createRefundReasonSubmission } from '@/components/customer/refund-request-dialog';

describe('createRefundReasonSubmission', () => {
  it('requires actual details for Other regardless of the translated label length', () => {
    const translate = (key: string) => key === 'ui.orders.refundReasonOther' ? '其他原因' : key;
    expect(createRefundReasonSubmission('other', '', translate)).toBeNull();
    expect(createRefundReasonSubmission('other', '重复扣款', translate)).toBeNull();
    expect(createRefundReasonSubmission('other', '重复扣款问题', translate)).toEqual({ reason: '重复扣款问题', reasonCode: 'other' });
  });

  it('accepts a known localized reason without using its label length as validation', () => {
    expect(createRefundReasonSubmission('schedule_change', '', (key) => key === 'ui.orders.refundReasonSchedule' ? '改期' : key))
      .toEqual({ reason: '改期', reasonCode: 'schedule_change' });
  });
});
