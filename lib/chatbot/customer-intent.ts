import type { CustomerStatusKind } from './customer-tools';

const STATUS_TERMS = /\b(my|mine|status|confirmed|confirmation|update|where is|where's|check(?: the)? status|reply|replied|response|went through|go through|charged|deducted|received)\b|我的|本人|我這|我这|確認了嗎|进度|處理到哪一步|处理到哪一步|有人回|回复|查一下|查詢|付款成功|扣款|sahkan|pengesahan|status saya|semak status|kemas kini|balasan/i;
const PERSONAL_STATUS_QUESTION = /订单状态|訂單狀態|工单状态|客服单状态|預訂狀態|预订状态|退款状态|付款状态|查询我的|查我的|查看我的|确认了吗|確認了嗎|我的.{0,6}(订单|訂單|预订|預訂|退款|工单|客服单|付款)|(?:订单|訂單|预订|預訂|退款|工单|客服单|付款).{0,8}我的/i;

export function resolveCustomerSupportIntent(question: string): CustomerStatusKind | null {
  const hasPersonalRecord = /\b(order|booking|reservation|refund|ticket|support case|payment)\b|订单|訂單|预订|預訂|退款|退钱|工单|客服单|付款|支付|pesanan|tempahan|bayaran balik|tiket sokongan/i.test(question);
  if (!hasPersonalRecord || !(STATUS_TERMS.test(question) || PERSONAL_STATUS_QUESTION.test(question))) return null;
  if (/refund|退款|退钱|bayaran balik|pemulangan wang/i.test(question)) return 'refunds';
  if (/ticket|工单|客服单|aduan|tiket sokongan/i.test(question)) return 'tickets';
  if (/booking|reservation|预订|預訂|预定|tempahan/i.test(question)) return 'bookings';
  if (/payment|paid|付款|支付|扣款|bayar|pembayaran/i.test(question)) return 'orders';
  if (/order|purchase|订单|訂單|购买|購買|pesanan/i.test(question)) return 'orders';
  return null;
}
