// Owner: Member 2/4 (Cart/Order/Booking/Wallet)
import type { Booking, Order, WithdrawalRequest } from "@/lib/types";

export const ORDERS: Order[] = [
  {
    id: "ord1", userId: "u5", status: "COMPLETED", createdAt: "2026-06-20T09:00:00Z",
    items: [{ activityId: "a1", activityName: "Penang Street Food Trail", variantLabel: "Adult", slotStartsAt: "2026-07-11T09:00:00", unitPrice: 68, qty: 2, outletId: "o1" }],
    subtotal: 136, discount: 13.6, total: 122.4, voucherCode: "WELCOME10",
  },
  {
    id: "ord2", userId: "u5", status: "COMPLETED", createdAt: "2026-06-22T11:00:00Z",
    items: [{ activityId: "a3", activityName: "Melaka Heritage Walk", variantLabel: "Adult", slotStartsAt: "2026-07-13T09:00:00", unitPrice: 45, qty: 1, outletId: "o3" }],
    subtotal: 45, discount: 0, total: 45,
  },
  {
    id: "ord3", userId: "u6", status: "PAID", createdAt: "2026-07-01T14:00:00Z",
    items: [{ activityId: "a2", activityName: "Langkawi Island Hopping", variantLabel: "Adult", slotStartsAt: "2026-07-12T09:00:00", unitPrice: 120, qty: 2, outletId: "o2" }],
    subtotal: 240, discount: 0, total: 240,
  },
  {
    id: "ord4", userId: "u6", status: "PAID", createdAt: "2026-07-02T10:00:00Z",
    items: [{ activityId: "a5", activityName: "KL Craft Market Entry", variantLabel: "Standard", unitPrice: 20, qty: 3, outletId: "o4" }],
    subtotal: 60, discount: 0, total: 60,
  },
  {
    id: "ord5", userId: "u7", status: "PENDING_PAYMENT", createdAt: "2026-07-09T08:00:00Z",
    items: [{ activityId: "a4", activityName: "Kinabalu Nature Day Trip", variantLabel: "Adult", slotStartsAt: "2026-07-15T09:00:00", unitPrice: 180, qty: 1, outletId: "o5" }],
    subtotal: 180, discount: 0, total: 180,
  },
  {
    id: "ord6", userId: "u7", status: "PAID", createdAt: "2026-07-05T16:00:00Z",
    items: [{ activityId: "a8", activityName: "Langkawi Sunset Cruise", variantLabel: "Adult", slotStartsAt: "2026-07-12T14:00:00", unitPrice: 150, qty: 2, outletId: "o2" }],
    subtotal: 300, discount: 50, total: 250, voucherCode: "BIG50",
  },
  {
    id: "ord7", userId: "u8", status: "CANCELLED", createdAt: "2026-06-28T09:00:00Z",
    items: [{ activityId: "a10", activityName: "KL Batik Souvenir Set", variantLabel: "Standard", unitPrice: 40, qty: 1, outletId: "o4" }],
    subtotal: 40, discount: 0, total: 40,
  },
  {
    id: "ord8", userId: "u5", status: "COMPLETED", createdAt: "2026-06-25T13:00:00Z",
    items: [{ activityId: "a7", activityName: "Heritage Cooking Class", variantLabel: "Adult", slotStartsAt: "2026-07-11T14:00:00", unitPrice: 95, qty: 2, outletId: "o1" }],
    subtotal: 190, discount: 0, total: 190,
  },
];

export const BOOKINGS: Booking[] = [
  { id: "bk1", orderId: "ord1", activityId: "a1", activityName: "Penang Street Food Trail", outletId: "o1", slotStartsAt: "2026-07-11T09:00:00", qty: 2, qrCode: "MY-2026-BK1" },
  { id: "bk2", orderId: "ord2", activityId: "a3", activityName: "Melaka Heritage Walk", outletId: "o3", slotStartsAt: "2026-07-13T09:00:00", qty: 1, qrCode: "MY-2026-BK2" },
  { id: "bk3", orderId: "ord3", activityId: "a2", activityName: "Langkawi Island Hopping", outletId: "o2", slotStartsAt: "2026-07-12T09:00:00", qty: 2, qrCode: "MY-2026-BK3" },
  { id: "bk4", orderId: "ord6", activityId: "a8", activityName: "Langkawi Sunset Cruise", outletId: "o2", slotStartsAt: "2026-07-12T14:00:00", qty: 2, qrCode: "MY-2026-BK4" },
  { id: "bk5", orderId: "ord8", activityId: "a7", activityName: "Heritage Cooking Class", outletId: "o1", slotStartsAt: "2026-07-11T14:00:00", qty: 2, qrCode: "MY-2026-BK5" },
];

export const WITHDRAWALS: WithdrawalRequest[] = [
  { id: "w1", userId: "u5", amount: 68.8, destination: "Maybank •••• 4821", status: "pending", requiresDualApproval: false, createdAt: "2026-07-08T10:00:00Z" },
  { id: "w2", userId: "u6", amount: 580, destination: "Touch 'n Go •••• 2290", status: "pending", requiresDualApproval: true, createdAt: "2026-07-07T09:00:00Z" },
  { id: "w3", userId: "u7", amount: 125, destination: "FPX / CIMB •••• 1187", status: "approved", requiresDualApproval: false, createdAt: "2026-07-01T09:00:00Z" },
  { id: "w4", userId: "u8", amount: 35, destination: "GrabPay •••• 5502", status: "rejected", requiresDualApproval: false, createdAt: "2026-06-30T09:00:00Z" },
];
