// The mock "DB" — a thin localStorage engine. One key per collection.
// Server-safe: every read/write guards on `typeof window`.
import { buildSeed } from "./seed";

export const KEYS = {
  users: "tp_users",
  currentUserId: "tp_current_user_id",
  outlets: "tp_outlets",
  activities: "tp_activities",
  bookingSlots: "tp_booking_slots",
  vouchers: "tp_vouchers",
  cart: "tp_cart",
  orders: "tp_orders",
  bookings: "tp_bookings",
  chatThreads: "tp_chat_threads",
  chatMessages: "tp_chat_messages",
  supportTickets: "tp_support_tickets",
  notifications: "tp_notifications",
  auditLogs: "tp_audit_logs",
  vendorRecommendations: "tp_vendor_recommendations",
  withdrawals: "tp_withdrawals",
} as const;

const SEEDED_FLAG = "tp_seeded_v1";

function isBrowser() {
  return typeof window !== "undefined";
}

export function getCollection<T>(key: string): T[] {
  if (!isBrowser()) return [];
  ensureSeeded();
  const raw = window.localStorage.getItem(key);
  if (!raw) return [];
  try {
    return JSON.parse(raw) as T[];
  } catch {
    return [];
  }
}

export function setCollection<T>(key: string, value: T[]): void {
  if (!isBrowser()) return;
  window.localStorage.setItem(key, JSON.stringify(value));
}

export function getValue<T>(key: string): T | null {
  if (!isBrowser()) return null;
  ensureSeeded();
  const raw = window.localStorage.getItem(key);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export function setValue<T>(key: string, value: T): void {
  if (!isBrowser()) return;
  window.localStorage.setItem(key, JSON.stringify(value));
}

export function ensureSeeded(): void {
  if (!isBrowser()) return;
  if (window.localStorage.getItem(SEEDED_FLAG)) return;
  seedAll();
}

export function seedAll(): void {
  if (!isBrowser()) return;
  const seed = buildSeed();
  window.localStorage.setItem(KEYS.users, JSON.stringify(seed.users));
  window.localStorage.setItem(KEYS.currentUserId, JSON.stringify(seed.users[0].id));
  window.localStorage.setItem(KEYS.outlets, JSON.stringify(seed.outlets));
  window.localStorage.setItem(KEYS.activities, JSON.stringify(seed.activities));
  window.localStorage.setItem(KEYS.bookingSlots, JSON.stringify(seed.bookingSlots));
  window.localStorage.setItem(KEYS.vouchers, JSON.stringify(seed.vouchers));
  window.localStorage.setItem(KEYS.cart, JSON.stringify([]));
  window.localStorage.setItem(KEYS.orders, JSON.stringify(seed.orders));
  window.localStorage.setItem(KEYS.bookings, JSON.stringify(seed.bookings));
  window.localStorage.setItem(KEYS.chatThreads, JSON.stringify(seed.chatThreads));
  window.localStorage.setItem(KEYS.chatMessages, JSON.stringify(seed.chatMessages));
  window.localStorage.setItem(KEYS.supportTickets, JSON.stringify(seed.supportTickets));
  window.localStorage.setItem(KEYS.notifications, JSON.stringify([]));
  window.localStorage.setItem(KEYS.auditLogs, JSON.stringify([]));
  window.localStorage.setItem(KEYS.vendorRecommendations, JSON.stringify(seed.vendorRecommendations));
  window.localStorage.setItem(KEYS.withdrawals, JSON.stringify(seed.withdrawals));
  window.localStorage.setItem(SEEDED_FLAG, "1");
}

/** Wipes all demo data and reseeds from the canonical seed. */
export function resetDemo(): void {
  if (!isBrowser()) return;
  window.localStorage.removeItem(SEEDED_FLAG);
  seedAll();
  window.location.href = "/login";
}
