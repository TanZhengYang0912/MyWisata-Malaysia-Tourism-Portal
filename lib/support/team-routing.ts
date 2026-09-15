// P4 — support ticket routing: which admin team a ticket's (AI- or
// keyword-)classified category belongs to. Pure lookup, no DB/framework —
// derived entirely from lib/chatbot/classify.ts's TicketCategory, so a team
// is known the instant a ticket is classified, with no extra write or
// migration. Not a real assignment (support_tickets.assigned_to stays
// whatever an admin picks by hand) — this labels which team's queue a
// ticket belongs in, so /admin/support's existing category filter doubles
// as a per-team queue view.

import type { TicketCategory } from '@/lib/chatbot/classify';

export const CATEGORY_TEAM: Record<TicketCategory, string> = {
  booking: 'Bookings Team',
  payment: 'Payments Team',
  vendor: 'Vendor Relations Team',
  withdrawal: 'Wallet Team',
  kyc: 'KYC Team',
  technical: 'Technical Support Team',
  affiliate: 'Affiliate Team',
  general: 'General Support Team',
};

/** Falls back to the General team for any category outside the known set (e.g. legacy/manually-typed data) — never leaves a ticket unrouted. */
export function teamForCategory(category: string): string {
  return CATEGORY_TEAM[category as TicketCategory] ?? CATEGORY_TEAM.general;
}
