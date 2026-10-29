import { isAppLocale, type AppLocale } from '@/lib/i18n/locale';

/** Transactional copy is local and fixed; recipient data never enters a translation API. */
export function emailLocale(value?: unknown): AppLocale { return isAppLocale(value) ? value : 'en'; }

const labels = {
  en: {
    greeting: 'Hi', there: 'there', amount: 'Amount', reference: 'Reference', time: 'Time', reason: 'Reason',
    summary: 'Review summary', vendor: 'Vendor', recommendation: 'Recommendation', event: 'Event', venue: 'Venue', dates: 'Dates',
    viewOrder: 'View your order', viewVendor: 'View in Vendor Portal', viewEvent: 'View event arrangements', arrangements: 'View your latest arrangements',
    privateLink: 'private link, valid for 7 days and usable once.', malaysiaTime: 'Malaysia time',
    automated: 'This is an automated message. Never reply with passwords or identity documents.',
    support: 'For questions, please contact support. Never reply with passwords or identity documents.',
    transaction: 'Your transaction has been updated in MYLawatan.', account: 'Your MYLawatan account status has been updated.',
    vendorUpdate: 'There is an important update for', recommended: 'Your recommendation has been approved.',
    reachOut: 'Great find! We will reach out to the vendor soon.', viewRecommendations: 'You can view your recommendations in MYLawatan.',
    security: 'MYLawatan KYC security alert', count: 'Count', reviewSecurity: 'Review KYC security status',
    securityGuidance: 'Sign in and verify your authenticator to review. Never reply with passwords or identity documents.',
    withdrawalReviewNotice: 'A withdrawal approval task is waiting in the protected Admin workspace. Sign in and verify your staff account to review it.',
    reviewWithdrawals: 'Open withdrawal approvals',
    approval: 'Your event participation is approved', yes: 'Yes', no: 'No', notSet: 'Not set',
    receipt: 'Order Receipt', receiptSubject: 'Your MYLawatan Order Receipt', confirmed: 'Booking Confirmed!',
    receiptIntro: "Thank you for your order. Your receipt is attached as a PDF. Here's a summary:",
    pickupQrTitle: 'Pickup QR code', pickupQrInstructions: 'Show this QR code to the merchant when collecting your order.',
    eventPickupQrInstructions: 'Show this QR code to the event vendor during the pickup date and time shown.',
    retailPickupQrInstructions: 'Show this code to the merchant to collect all quantities listed below in one pickup. Keep it private.',
    foodDineIn: 'Dine in', foodTakeaway: 'Takeaway', qrImageAlt: 'Pickup QR code',
    activity: 'Activity', variant: 'Variant', quantity: 'Qty', unitPrice: 'Unit Price', subtotal: 'Subtotal', discount: 'Discount', total: 'Total',
    orderId: 'Order number', date: 'Date', payment: 'Payment', customer: 'Customer', standard: 'Standard', guest: 'Guest',
    thanks: 'Thank you for booking with MYLawatan Malaysia!', questions: 'For support, contact us at support@mylawatan.my',
    seeYou: 'See you in Malaysia! 🌴', inviteAction: 'Complete vendor sign-up', inviteNote: 'Use the secure link below to continue.',
  },
  'zh-CN': {
    greeting: '您好', there: '用户', amount: '金额', reference: '参考编号', time: '时间', reason: '原因',
    summary: '审核说明', vendor: '商家', recommendation: '推荐商家', event: '活动', venue: '地点', dates: '日期',
    viewOrder: '查看订单', viewVendor: '查看商家后台', viewEvent: '查看活动安排', arrangements: '查看最新安排',
    privateLink: '私人链接，有效期为 7 天，仅可使用一次。', malaysiaTime: '马来西亚时间',
    automated: '此邮件由系统自动发送，请勿回复密码或身份证明文件。',
    support: '如有疑问，请联系客服。请勿回复密码或身份证明文件。',
    transaction: '您的交易状态已更新。', account: '您的 MYLawatan 账户状态已更新。',
    vendorUpdate: '以下商家有重要更新', recommended: '您的推荐已获批准。',
    reachOut: '感谢您的推荐！我们将尽快联系商家。', viewRecommendations: '您可以在 MYLawatan 查看自己的推荐。',
    security: 'MYLawatan KYC 安全警报', count: '数量', reviewSecurity: '查看 KYC 安全状态',
    securityGuidance: '请登录并通过身份验证器验证后查看。请勿回复密码或身份证明文件。',
    withdrawalReviewNotice: '受保护的 Admin 工作区有一项提现审核任务待处理。请登录并验证员工账号后查看。',
    reviewWithdrawals: '打开提现审批',
    approval: '您的活动参与申请已获批准', yes: '是', no: '否', notSet: '未设置',
    receipt: '订单收据', receiptSubject: '您的 MYLawatan 订单收据', confirmed: '预订已确认！',
    receiptIntro: '感谢您的订购。PDF 收据已随邮件附上，以下是订单摘要：',
    pickupQrTitle: '领取二维码', pickupQrInstructions: '领取订单时，请向商家出示此二维码。',
    eventPickupQrInstructions: '请在显示的活动取货日期和时段，向活动商家出示此二维码。',
    retailPickupQrInstructions: '领取商品时向商家出示此码，一次领取下方所列全部数量。请勿分享。',
    foodDineIn: '堂食', foodTakeaway: '打包', qrImageAlt: '领取二维码',
    activity: '项目', variant: '规格', quantity: '数量', unitPrice: '单价', subtotal: '小计', discount: '折扣', total: '总额',
    orderId: '订单编号', date: '日期', payment: '付款方式', customer: '顾客', standard: '标准', guest: '访客',
    thanks: '感谢您通过 MYLawatan Malaysia 预订！', questions: '如需帮助，请联系 support@mylawatan.my',
    seeYou: '期待在马来西亚与您相见！', inviteAction: '完成商家注册', inviteNote: '请使用下方的安全链接继续。',
  },
  ms: {
    greeting: 'Salam', there: 'pengguna', amount: 'Amaun', reference: 'Rujukan', time: 'Masa', reason: 'Sebab',
    summary: 'Ringkasan semakan', vendor: 'Peniaga', recommendation: 'Cadangan', event: 'Acara', venue: 'Lokasi', dates: 'Tarikh',
    viewOrder: 'Lihat pesanan', viewVendor: 'Lihat Portal Peniaga', viewEvent: 'Lihat aturan acara', arrangements: 'Lihat aturan terkini anda',
    privateLink: 'pautan peribadi, sah selama 7 hari dan hanya boleh digunakan sekali.', malaysiaTime: 'waktu Malaysia',
    automated: 'Ini ialah mesej automatik. Jangan balas dengan kata laluan atau dokumen pengenalan.',
    support: 'Untuk pertanyaan, hubungi sokongan. Jangan balas dengan kata laluan atau dokumen pengenalan.',
    transaction: 'Status transaksi anda telah dikemas kini.', account: 'Status akaun MYLawatan anda telah dikemas kini.',
    vendorUpdate: 'Terdapat kemas kini penting untuk', recommended: 'Cadangan anda telah diluluskan.',
    reachOut: 'Terima kasih atas cadangan anda! Kami akan menghubungi peniaga tidak lama lagi.', viewRecommendations: 'Anda boleh melihat cadangan anda dalam MYLawatan.',
    security: 'Amaran keselamatan KYC MYLawatan', count: 'Bilangan', reviewSecurity: 'Semak status keselamatan KYC',
    securityGuidance: 'Log masuk dan sahkan pengesah anda untuk menyemak. Jangan balas dengan kata laluan atau dokumen pengenalan.',
    withdrawalReviewNotice: 'Terdapat tugasan kelulusan pengeluaran dalam ruang Admin yang dilindungi. Log masuk dan sahkan akaun kakitangan anda untuk menyemaknya.',
    reviewWithdrawals: 'Buka kelulusan pengeluaran',
    approval: 'Penyertaan acara anda diluluskan', yes: 'Ya', no: 'Tidak', notSet: 'Belum ditetapkan',
    receipt: 'Resit Pesanan', receiptSubject: 'Resit Pesanan MYLawatan Anda', confirmed: 'Tempahan Disahkan!',
    receiptIntro: 'Terima kasih atas pesanan anda. Resit PDF dilampirkan. Berikut ialah ringkasannya:',
    pickupQrTitle: 'Kod QR pengambilan', pickupQrInstructions: 'Tunjukkan kod QR ini kepada peniaga semasa mengambil pesanan.',
    eventPickupQrInstructions: 'Tunjukkan kod QR ini kepada peniaga acara pada tarikh dan masa pengambilan yang tertera.',
    retailPickupQrInstructions: 'Tunjukkan kod ini kepada peniaga untuk mengambil semua kuantiti yang disenaraikan di bawah sekali gus. Jangan kongsikan kod ini.',
    foodDineIn: 'Makan di sini', foodTakeaway: 'Bawa pulang', qrImageAlt: 'Kod QR pengambilan',
    activity: 'Aktiviti', variant: 'Varian', quantity: 'Kuantiti', unitPrice: 'Harga Seunit', subtotal: 'Subjumlah', discount: 'Diskaun', total: 'Jumlah',
    orderId: 'Nombor Pesanan', date: 'Tarikh', payment: 'Kaedah Bayaran', customer: 'Pelanggan', standard: 'Standard', guest: 'Tetamu',
    thanks: 'Terima kasih kerana menempah dengan MYLawatan Malaysia!', questions: 'Untuk sokongan, hubungi support@mylawatan.my',
    seeYou: 'Jumpa anda di Malaysia!', inviteAction: 'Lengkapkan pendaftaran peniaga', inviteNote: 'Gunakan pautan selamat di bawah untuk meneruskan.',
  },
} satisfies Record<AppLocale, Record<string, string>>;

export function emailCopy(locale?: unknown) { return labels[emailLocale(locale)]; }
export function vendorInviteCopy(name: string, locale?: unknown, event = false, brand = 'MYLawatan') {
  const selected = emailLocale(locale);
  if (selected === 'zh-CN') return {
    subject: event ? `邀请 ${name} 成为活动商家` : `完成 ${name} 的商家入驻`,
    introduction: event ? `${name} 已获邀成为 ${brand} 的活动合作商家。` : `${name} 已获邀完成商家入驻。`,
    action: event ? '在此完成活动商家注册' : '在此完成商家注册', dashboard: '访问商家后台',
  };
  if (selected === 'ms') return {
    subject: event ? `Jemputan untuk ${name} menjadi peniaga acara` : `Lengkapkan pendaftaran peniaga ${name}`,
    introduction: event ? `${name} dijemput menyertai ${brand} sebagai rakan acara.` : `${name} dijemput melengkapkan pendaftaran peniaga.`,
    action: event ? 'Lengkapkan pendaftaran peniaga acara di sini' : 'Lengkapkan pendaftaran peniaga di sini', dashboard: 'Lawati papan pemuka peniaga',
  };
  return {
    subject: event ? `You're invited to sell at events as ${name}` : `Complete ${name} vendor onboarding`,
    introduction: event ? `${name} has been invited to join ${brand} as an event partner.` : 'Your business has been invited to complete vendor onboarding.',
    action: event ? 'Complete your event vendor sign-up here' : 'Complete your vendor sign-up here', dashboard: 'Visit your vendor dashboard',
  };
}
export function emailTime(value: string, locale?: unknown): string {
  const selected = emailLocale(locale);
  return new Date(value).toLocaleString(selected === 'en' ? 'en-MY' : selected === 'ms' ? 'ms-MY' : 'zh-CN', {
    timeZone: 'Asia/Kuala_Lumpur', dateStyle: 'medium', timeStyle: 'short',
  });
}

export function emailPaymentMethod(method: string, locale?: unknown): string {
  const selected = emailLocale(locale);
  const methods: Record<string, readonly [string, string, string]> = {
    stripe_card: ['Card (Stripe)', '银行卡（Stripe）', 'Kad (Stripe)'],
    wallet: ['Wallet', '钱包', 'Dompet'], wallet_split: ['Wallet and card', '钱包与银行卡', 'Dompet dan kad'],
    toyyibpay: ['Online banking (ToyyibPay)', '网上银行（ToyyibPay）', 'Perbankan dalam talian (ToyyibPay)'],
    free_reservation: ['Free reservation', '免费预订', 'Tempahan percuma'],
    mock_card: ['Test card', '测试银行卡', 'Kad ujian'], mock_fpx: ['Test online banking', '测试网上银行', 'Perbankan dalam talian ujian'],
    mock_ewallet: ['Test e-wallet', '测试电子钱包', 'E-dompet ujian'],
  };
  return methods[method]?.[selected === 'zh-CN' ? 1 : selected === 'ms' ? 2 : 0] ?? method.replace(/_/g, ' ');
}

/** Each entry is [English, Simplified Chinese, Bahasa Melayu]. */
const subjects = {
  checkout_succeeded: ['Checkout payment received', '订单付款已收到', 'Bayaran pesanan diterima'],
  order_refunded: ['Order refund completed', '订单退款已完成', 'Bayaran balik pesanan selesai'],
  topup_succeeded: ['Wallet Top-up successful', '钱包充值成功', 'Tambah nilai dompet berjaya'],
  topup_failed: ['Wallet Top-up failed', '钱包充值失败', 'Tambah nilai dompet gagal'],
  topup_refunded: ['Wallet Top-up refunded', '钱包充值已退款', 'Tambah nilai dompet dibayar balik'],
  withdrawal_submitted: ['Withdrawal request received', '提现申请已收到', 'Permohonan pengeluaran diterima'],
  staff_withdrawal_approval: ['Withdrawal review task assigned', '有提现审核任务待处理', 'Tugasan semakan pengeluaran ditugaskan'],
  withdrawal_approved: ['Withdrawal approved', '提现已批准', 'Pengeluaran diluluskan'],
  withdrawal_hold: ['Withdrawal placed on hold', '提现已暂缓', 'Pengeluaran ditangguhkan'],
  withdrawal_resumed: ['Withdrawal review resumed', '提现审核已恢复', 'Semakan pengeluaran disambung semula'],
  withdrawal_paid: ['Withdrawal paid', '提现款项已支付', 'Pengeluaran telah dibayar'],
  withdrawal_failed: ['Withdrawal failed', '提现失败', 'Pengeluaran gagal'],
  withdrawal_rejected: ['Withdrawal rejected', '提现申请已被拒绝', 'Permohonan pengeluaran ditolak'],
  wallet_adjustment: ['Wallet balance adjusted', '钱包余额已调整', 'Baki dompet diselaraskan'],
  payout_account_connected: ['Payout account connected', '收款账户已连接', 'Akaun pembayaran disambungkan'],
  payout_account_disconnected: ['Payout account disconnected', '收款账户已断开连接', 'Akaun pembayaran diputuskan'],
  recommendation_reward_pending: ['Your recommendation earned a pending reward', '您的推荐获得待确认奖励', 'Cadangan anda menerima ganjaran tertunda'],
  recommendation_reward_available: ['Your recommendation reward is now available', '您的推荐奖励已可使用', 'Ganjaran cadangan anda kini tersedia'],
  recommendation_reward_reversed: ['Your pending recommendation reward was reversed', '您的待确认推荐奖励已撤回', 'Ganjaran cadangan tertunda anda dibatalkan'],
  account_suspended: ['Your account has been suspended', '您的账户已被暂停', 'Akaun anda digantung'],
  account_unsuspended: ['Your account has been reinstated', '您的账户已恢复使用', 'Akaun anda diaktifkan semula'],
  account_deleted: ['Your account has been closed', '您的账户已关闭', 'Akaun anda ditutup'],
  account_restored: ['Your account has been restored', '您的账户已恢复', 'Akaun anda dipulihkan'],
  recommendation_approved: ['Your recommendation was approved', '您的推荐已获批准', 'Cadangan anda diluluskan'],
  vendor_order_update: ['Vendor order update', '商家订单更新', 'Kemas kini pesanan peniaga'],
  vendor_booking_update: ['Vendor booking update', '商家预订更新', 'Kemas kini tempahan peniaga'],
  vendor_listing_review: ['Vendor listing review update', '商品审核更新', 'Kemas kini semakan penyenaraian peniaga'],
  vendor_wallet_update: ['Vendor wallet update', '商家钱包更新', 'Kemas kini dompet peniaga'],
  vendor_account_update: ['Vendor account update', '商家账户更新', 'Kemas kini akaun peniaga'],
  vendor_permission_update: ['Vendor permission update', '商家权限更新', 'Kemas kini kebenaran peniaga'],
  vendor_event_update: ['Your event arrangements changed', '您的活动安排已更改', 'Aturan acara anda berubah'],
} as const;

export function emailSubject(event: keyof typeof subjects, locale?: unknown): string {
  const selected = emailLocale(locale);
  return subjects[event][selected === 'zh-CN' ? 1 : selected === 'ms' ? 2 : 0];
}

export const eventReasonCodes = ['payment_blocked', 'pickup_review', 'refund_pending', 'refund_attention', 'refunded', 'collected', 'no_show'] as const;
export type EventEmailReasonCode = typeof eventReasonCodes[number];
const reasons: Record<EventEmailReasonCode, readonly [string, string, string]> = {
  payment_blocked: ['Payment was received but this reservation cannot be fulfilled. Do not prepare or hand over goods. Admin is reviewing the payment.', '付款已收到，但此预订无法履约。请勿备货或交货，管理员正在核查付款。', 'Bayaran diterima tetapi tempahan ini tidak dapat dipenuhi. Jangan sediakan atau serahkan barang. Admin sedang menyemak bayaran.'],
  pickup_review: ['The pickup date has passed and collection is unconfirmed. Please verify whether your items were handed over and contact Admin with the actual outcome.', '取货日期已过，领取结果尚未确认。请核实商品是否已交付，并向管理员提供实际情况。', 'Tarikh pengambilan telah berlalu dan penerimaan belum disahkan. Sila sahkan sama ada barang telah diserahkan dan maklumkan hasil sebenar kepada Admin.'],
  refund_pending: ['A refund is under review or awaiting the payment provider. It has not been confirmed complete. Contact Admin before further fulfilment.', '退款正在审核或等待支付服务商处理，尚未确认完成。继续履约前请先联系管理员。', 'Bayaran balik sedang disemak atau menunggu penyedia bayaran dan belum disahkan selesai. Hubungi Admin sebelum meneruskan pemenuhan.'],
  refund_attention: ['A refund needs Admin attention. Completion has not been confirmed. Contact Admin before further fulfilment.', '退款需要管理员处理，尚未确认完成。继续履约前请先联系管理员。', 'Bayaran balik memerlukan perhatian Admin dan belum disahkan selesai. Hubungi Admin sebelum meneruskan pemenuhan.'],
  refunded: ['The order refund has been confirmed complete. Review your order and settlement records.', '订单退款已确认完成，请查看订单与结算记录。', 'Bayaran balik pesanan telah disahkan selesai. Semak rekod pesanan dan penyelesaian anda.'],
  collected: ['Collection has been verified and the pickup exception is closed.', '已核实商品领取，取货异常已关闭。', 'Pengambilan telah disahkan dan pengecualian pengambilan ditutup.'],
  no_show: ['Admin has verified non-collection and closed this pickup exception without a refund. This does not mean goods were handed over or funds are immediately available.', '管理员已核实顾客未领取，并关闭此次取货异常，未进行退款。这不表示商品已交付或款项已可立即使用。', 'Admin telah mengesahkan barang tidak diambil dan menutup pengecualian tanpa bayaran balik. Ini tidak bermakna barang diserahkan atau dana tersedia serta-merta.'],
};

export function emailReason(reason: string, locale?: unknown, code?: EventEmailReasonCode, details?: string): string {
  const selected = emailLocale(locale);
  if (code && Object.hasOwn(reasons, code)) return [reasons[code][selected === 'zh-CN' ? 1 : selected === 'ms' ? 2 : 0], details].filter(Boolean).join(' ');
  // Exact fixed system messages only. Do not translate or alter arbitrary evidence.
  const fixed: Record<string, readonly [string, string, string]> = {
     'Your approved payout has been sent to your connected account.': ['Your approved payout has been sent to your connected account.', '已批准的提现款项已发送至您的关联账户。', 'Pengeluaran yang diluluskan telah dihantar ke akaun terpaut anda.'],
    'Your payout could not be completed. Please review your connected account.': ['Your payout could not be completed. Please review your connected account.', '提现未能完成，请检查您的关联账户。', 'Pengeluaran tidak dapat diselesaikan. Sila semak akaun terpaut anda.'],
    'Your payout account is connected and eligible to receive approved withdrawals.': ['Your payout account is connected and eligible to receive approved withdrawals.', '您的收款账户已连接，可以接收已批准的提现款项。', 'Akaun pembayaran anda disambungkan dan layak menerima pengeluaran yang diluluskan.'],
    'Your payout account is no longer eligible to receive payouts. Please review your Stripe account status.': ['Your payout account is no longer eligible to receive payouts. Please review your Stripe account status.', '您的收款账户目前无法接收款项，请检查 Stripe 账户状态。', 'Akaun pembayaran anda tidak lagi layak menerima pembayaran. Sila semak status akaun Stripe anda.'],
    'An Outlet Manager has been assigned to your outlet.': ['An Outlet Manager has been assigned to your outlet.', '您的门店已分配一位门店经理。', 'Seorang Pengurus Cawangan telah ditugaskan ke cawangan anda.'],
    'Your Outlet Manager access for this outlet was removed.': ['Your Outlet Manager access for this outlet was removed.', '您对此门店的经理访问权限已被移除。', 'Akses Pengurus Cawangan anda untuk cawangan ini telah dibuang.'],
    'Your vendor account is approved and ready to manage.': ['Your vendor account is approved and ready to manage.', '您的商家账户已获批准，可以开始管理。', 'Akaun peniaga anda diluluskan dan sedia untuk diurus.'],
    'Your vendor application was rejected.': ['Your vendor application was rejected.', '您的商家申请已被拒绝。', 'Permohonan peniaga anda ditolak.'],
    'Your vendor account has been suspended.': ['Your vendor account has been suspended.', '您的商家账户已被暂停。', 'Akaun peniaga anda telah digantung.'],
    'Your vendor account is active again.': ['Your vendor account is active again.', '您的商家账户已恢复使用。', 'Akaun peniaga anda aktif semula.'],
    'Account status updated': ['Account status updated', '账户状态已更新', 'Status akaun dikemas kini'],
    'Participation approved': ['Participation approved', '活动参与申请已批准', 'Penyertaan diluluskan'],
    'Your requested order receipt.': ['Your requested order receipt.', '这是您申请的订单收据。', 'Berikut ialah resit pesanan yang anda minta.'],
    'The organiser cancelled this reservation. Paid reservations follow the existing refund process.': ['The organiser cancelled this reservation. Paid reservations follow the existing refund process.', '主办方已取消此预订，已付款的预订将按现有退款流程处理。', 'Penganjur membatalkan tempahan ini. Tempahan berbayar mengikuti proses bayaran balik sedia ada.'],
  };
  if (Object.hasOwn(fixed, reason)) return fixed[reason][selected === 'zh-CN' ? 1 : selected === 'ms' ? 2 : 0];
  // Recognize only the complete, existing producer grammar. Keep free-text notes intact.
  if (selected !== 'en') {
    const paid = /^Order ([\w-]+) has been paid and is ready for fulfilment\.$/.exec(reason);
    if (paid) return selected === 'zh-CN' ? `订单 ${paid[1]} 已付款，可以开始履约。` : `Pesanan ${paid[1]} telah dibayar dan sedia untuk dipenuhi.`;
    const updated = /^Order ([\w-]+) was updated\.$/.exec(reason);
    if (updated) return selected === 'zh-CN' ? `订单 ${updated[1]} 已更新。` : `Pesanan ${updated[1]} dikemas kini.`;
    const refund = /^A customer requested a refund for ([\w-]+)\. Review the request before further fulfilment\.$/.exec(reason);
    if (refund) return selected === 'zh-CN' ? `顾客已申请订单 ${refund[1]} 的退款。继续履约前请先审核申请。` : `Pelanggan meminta bayaran balik untuk ${refund[1]}. Semak permintaan sebelum meneruskan pemenuhan.`;
    const fulfilled = /^Order ([\w-]+) was marked (ready|fulfilled|cancelled)\.$/.exec(reason);
    if (fulfilled) {
      const statuses: Record<string, readonly [string,string]> = { ready: ['待领取','sedia diambil'], fulfilled: ['已完成','dipenuhi'], cancelled: ['已取消','dibatalkan'] };
      return selected === 'zh-CN' ? `订单 ${fulfilled[1]} 已标记为${statuses[fulfilled[2]][0]}。` : `Pesanan ${fulfilled[1]} ditandakan sebagai ${statuses[fulfilled[2]][1]}.`;
    }
    const review = /^Your (product|activity|outlet) review was (approved|rejected)(?:\.|: ([\s\S]+))$/.exec(reason);
    if (review) {
      const entity: Record<string,readonly[string,string]> = {product:['商品','produk'],activity:['活动','aktiviti'],outlet:['门店','cawangan']};
      const result = review[2] === 'approved' ? ['已获批准','diluluskan'] : ['已被拒绝','ditolak'];
      return (selected === 'zh-CN' ? `您的${entity[review[1]][0]}审核${result[0]}。` : `Semakan ${entity[review[1]][1]} anda ${result[1]}.`) + (review[3] ? ` ${review[3]}` : '');
    }
  }
  return reason;
}

export function eventFieldLabel(field: string, locale?: unknown): string {
  const fields: Record<string, readonly [string, string, string]> = {
    stallNumber: ['Stall', '摊位', 'Gerai'], name: ['Venue name', '地点名称', 'Nama lokasi'], address: ['Address', '地址', 'Alamat'], mapPin: ['Map pin', '地图位置', 'Pin peta'],
    startsOn: ['First date', '开始日期', 'Tarikh mula'], endsOn: ['Last date', '结束日期', 'Tarikh akhir'], opensAt: ['Opening time', '营业开始时间', 'Masa buka'], closesAt: ['Closing time', '营业结束时间', 'Masa tutup'],
    applicationsOpen: ['Applications open', '报名开放', 'Permohonan dibuka'], applicationsCloseAt: ['Applications close', '报名截止', 'Permohonan ditutup'], approvalsCloseAt: ['Approvals close', '审批截止', 'Kelulusan ditutup'], setupStartsAt: ['Setup starts', '布展开始', 'Persediaan bermula'],
  };
  const selected = emailLocale(locale);
  return fields[field]?.[selected === 'zh-CN' ? 1 : selected === 'ms' ? 2 : 0] ?? field;
}

export function securityDescription(kind: string, locale?: unknown): string {
  const descriptions: Record<string, readonly [string, string, string]> = {
    purge_failed: ['The KYC evidence cleanup failed or completed with failures.', 'KYC 证明资料清理失败或部分失败。', 'Pembersihan bukti KYC gagal atau selesai dengan kegagalan.'],
    purge_stalled: ['The KYC evidence cleanup has not completed within 15 minutes.', 'KYC 证明资料清理在 15 分钟内尚未完成。', 'Pembersihan bukti KYC belum selesai dalam 15 minit.'],
    purge_missed: ['No successful KYC evidence cleanup was recorded for more than 26 hours.', '超过 26 小时未记录到成功的 KYC 证明资料清理。', 'Tiada pembersihan bukti KYC berjaya direkodkan selama lebih 26 jam.'],
    access_volume: ['A reviewer requested documents for at least 10 distinct submissions within 10 minutes.', '一位审核员在 10 分钟内请求查看了至少 10 份不同申请的文件。', 'Seorang penyemak meminta dokumen bagi sekurang-kurangnya 10 permohonan berbeza dalam 10 minit.'],
    monitor_test: ['This is a controlled test of KYC security alert delivery. No identity documents are included.', '这是 KYC 安全警报发信的受控测试，未包含身份证明文件。', 'Ini ialah ujian terkawal penghantaran amaran keselamatan KYC. Tiada dokumen pengenalan disertakan.'],
  };
  const selected = emailLocale(locale);
  return descriptions[kind]?.[selected === 'zh-CN' ? 1 : selected === 'ms' ? 2 : 0] ?? '';
}
