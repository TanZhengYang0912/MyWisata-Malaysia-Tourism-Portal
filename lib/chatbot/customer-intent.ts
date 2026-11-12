import type { CustomerStatusKind } from './customer-tools';

const STATUS_TERMS = /\b(status|confirmed|confirmation|update|where is|where's|check(?: the)? status|reply|replied|response|went through|go through|charged|deducted|received|paid|approved|pending|processed|reviewed)\b|我的|本人|我這|我这|確認了嗎|状态|狀態|进度|處理到哪一步|处理到哪一步|审核|審核|有人回|回复|查一下|查詢|付款成功|扣款|sahkan|pengesahan|status saya|semak status|kemas kini|balasan/i;
const PERSONAL_STATUS_QUESTION = /订单状态|訂單狀態|工单状态|客服单状态|預訂狀態|预订状态|退款状态|付款状态|提现状态|提款状态|kyc.{0,8}status|status.{0,8}kyc|查询我的|查我的|查看我的|确认了吗|確認了嗎|我的.{0,8}(订单|訂單|预订|預訂|退款|工单|客服单|付款|提现|提款|kyc|身份)|(?:订单|訂單|预订|預訂|退款|工单|客服单|付款|提现|提款|kyc|身份).{0,8}我的/i;
const THIRD_PARTY_RECORD_QUESTION = /\b(?:someone else|another person|my (?:mother|mom|father|dad|wife|husband|friend|sister|brother|child|son|daughter|colleague)(?:'s|s))\b|别人的|他人的|朋友的|家人的|我(?:妈妈|母亲|爸爸|父亲|朋友|姐姐|妹妹|哥哥|弟弟|妻子|丈夫|孩子|女儿|儿子)的/i;
const STATUS_INSTRUCTION_QUESTION = /\bhow (?:can|do) i (?:check|track|view|find|see|look up)\b|怎么(?:查|查询|查看)|如何(?:查|查询|查看)/i;
const PERSONAL_RECORD_LOOKUP = /\b(?:check|look up|find|show|track|tell me about)\s+(?:the\s+)?(?:status(?:\s+of\s+)?\s+)?my\s+(?:order|booking|reservation|refund|ticket|support case|payment|withdrawal|payout|cash[ -]?out|kyc|identity verification)\b/i;

export function resolveCustomerSupportIntent(question: string): CustomerStatusKind | null {
  if (THIRD_PARTY_RECORD_QUESTION.test(question)) return null;
  if (STATUS_INSTRUCTION_QUESTION.test(question)) return null;
  const hasPersonalRecord = /\b(order|booking|reservation|refund|ticket|support case|payment|withdrawal|payout|cash[ -]?out|kyc|identity verification)\b|订单|訂單|预订|預訂|退款|退钱|提现|提款|工单|客服单|付款|支付|身份验证|身份驗證|pesanan|tempahan|bayaran balik|pengeluaran|pengesahan identiti|tiket sokongan/i.test(question);
  if (!hasPersonalRecord || !(STATUS_TERMS.test(question) || PERSONAL_STATUS_QUESTION.test(question) || PERSONAL_RECORD_LOOKUP.test(question))) return null;
  if (/refund|退款|退钱|bayaran balik|pemulangan wang/i.test(question)) return 'refunds';
  if (/ticket|工单|客服单|aduan|tiket sokongan/i.test(question)) return 'tickets';
  if (/booking|reservation|预订|預訂|预定|tempahan/i.test(question)) return 'bookings';
  if (/withdrawal|payout|cash[ -]?out|提现|提現|提款|pengeluaran/i.test(question)) return 'withdrawals';
  if (/\bkyc\b|identity verification|identity check|身份验证|身份驗證|身份证|身分證|pengesahan identiti/i.test(question)) return 'kyc';
  if (/payment|paid|付款|支付|扣款|bayar|pembayaran/i.test(question)) return 'orders';
  if (/order|purchase|订单|訂單|购买|購買|pesanan/i.test(question)) return 'orders';
  return null;
}
