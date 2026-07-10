import { USERS, CHAT_THREADS, CHAT_MESSAGES, SUPPORT_TICKETS } from "./identity";
import { OUTLETS, ACTIVITIES, BOOKING_SLOTS, VOUCHERS } from "./catalogue";
import { ORDERS, BOOKINGS, WITHDRAWALS } from "./commerce";
import { VENDOR_RECOMMENDATIONS } from "./discovery";

export function buildSeed() {
  return {
    users: USERS,
    chatThreads: CHAT_THREADS,
    chatMessages: CHAT_MESSAGES,
    supportTickets: SUPPORT_TICKETS,
    outlets: OUTLETS,
    activities: ACTIVITIES,
    bookingSlots: BOOKING_SLOTS,
    vouchers: VOUCHERS,
    orders: ORDERS,
    bookings: BOOKINGS,
    withdrawals: WITHDRAWALS,
    vendorRecommendations: VENDOR_RECOMMENDATIONS,
  };
}
