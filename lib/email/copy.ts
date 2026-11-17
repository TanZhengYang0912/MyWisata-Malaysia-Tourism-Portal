/** System mail is English only; recipient data never enters a translation API. */

const labels = {
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
};

export function emailCopy() { return labels; }
export function vendorInviteCopy(name: string, event = false, brand = 'MYLawatan') {
  return {
    subject: event ? `You're invited to sell at events as ${name}` : `Complete ${name} vendor onboarding`,
    introduction: event ? `${name} has been invited to join ${brand} as an event partner.` : 'Your business has been invited to complete vendor onboarding.',
    action: event ? 'Complete your event vendor sign-up here' : 'Complete your vendor sign-up here', dashboard: 'Visit your vendor dashboard',
  };
}
export function emailTime(value: string): string {
  return new Date(value).toLocaleString('en-MY', {
    timeZone: 'Asia/Kuala_Lumpur', dateStyle: 'medium', timeStyle: 'short',
  });
}

export function emailPaymentMethod(method: string): string {
  const methods: Record<string, string> = {
    stripe_card: 'Card (Stripe)',
    wallet: 'Wallet', wallet_split: 'Wallet and card',
    toyyibpay: 'Online banking (ToyyibPay)',
    free_reservation: 'Free reservation',
    mock_card: 'Test card', mock_fpx: 'Test online banking',
    mock_ewallet: 'Test e-wallet',
  };
  return methods[method] ?? method.replace(/_/g, ' ');
}

const subjects = {
  checkout_succeeded: 'Checkout payment received',
  order_refunded: 'Order refund completed',
  topup_succeeded: 'Wallet Top-up successful',
  topup_failed: 'Wallet Top-up failed',
  topup_refunded: 'Wallet Top-up refunded',
  withdrawal_submitted: 'Withdrawal request received',
  staff_withdrawal_approval: 'Withdrawal review task assigned',
  withdrawal_approved: 'Withdrawal approved',
  withdrawal_hold: 'Withdrawal placed on hold',
  withdrawal_resumed: 'Withdrawal review resumed',
  withdrawal_paid: 'Withdrawal paid',
  withdrawal_failed: 'Withdrawal failed',
  withdrawal_rejected: 'Withdrawal rejected',
  wallet_adjustment: 'Wallet balance adjusted',
  payout_account_connected: 'Payout account connected',
  payout_account_disconnected: 'Payout account disconnected',
  recommendation_reward_pending: 'Your recommendation earned a pending reward',
  recommendation_reward_available: 'Your recommendation reward is now available',
  recommendation_reward_reversed: 'Your pending recommendation reward was reversed',
  account_suspended: 'Your account has been suspended',
  account_unsuspended: 'Your account has been reinstated',
  account_deleted: 'Your account has been closed',
  account_restored: 'Your account has been restored',
  recommendation_approved: 'Your recommendation was approved',
  vendor_order_update: 'Vendor order update',
  vendor_booking_update: 'Vendor booking update',
  vendor_listing_review: 'Vendor listing review update',
  vendor_wallet_update: 'Vendor wallet update',
  vendor_account_update: 'Vendor account update',
  vendor_permission_update: 'Vendor permission update',
  vendor_event_update: 'Your event arrangements changed',
} as const;

export function emailSubject(event: keyof typeof subjects): string {
  return subjects[event];
}

export function eventFieldLabel(field: string): string {
  const fields: Record<string, string> = {
    stallNumber: 'Stall', name: 'Venue name', address: 'Address', mapPin: 'Map pin',
    startsOn: 'First date', endsOn: 'Last date', opensAt: 'Opening time', closesAt: 'Closing time',
    applicationsOpen: 'Applications open', applicationsCloseAt: 'Applications close', approvalsCloseAt: 'Approvals close', setupStartsAt: 'Setup starts',
  };
  return fields[field] ?? field;
}

export function securityDescription(kind: string): string {
  const descriptions: Record<string, string> = {
    purge_failed: 'The KYC evidence cleanup failed or completed with failures.',
    purge_stalled: 'The KYC evidence cleanup has not completed within 15 minutes.',
    purge_missed: 'No successful KYC evidence cleanup was recorded for more than 26 hours.',
    access_volume: 'A reviewer requested documents for at least 10 distinct submissions within 10 minutes.',
    monitor_test: 'This is a controlled test of KYC security alert delivery. No identity documents are included.',
  };
  return descriptions[kind] ?? '';
}
