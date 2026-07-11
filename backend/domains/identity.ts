// Owner: Member 1 (Platform/Identity/Chat)
import { getCollection, getValue, KEYS, setCollection, setValue } from "../core/mockdb";
import type { ChatMessage, ChatThread, Notification, SupportTicket, User } from "@/backend/core/types";

export function getUsers(): User[] {
  return getCollection<User>(KEYS.users);
}

export function getUser(id: string): User | undefined {
  return getUsers().find((u) => u.id === id);
}

export function getCurrentUserId(): string | null {
  return getValue<string>(KEYS.currentUserId);
}

export function setCurrentUserId(id: string): void {
  setValue(KEYS.currentUserId, id);
}

export function getCurrentUser(): User | null {
  const id = getCurrentUserId();
  if (!id) return null;
  return getUser(id) ?? null;
}

// ─── Chat ───────────────────────────────────────────────────────────────────
export function getThreadsForUser(userId: string): ChatThread[] {
  return getCollection<ChatThread>(KEYS.chatThreads).filter((t) => t.customerId === userId);
}

export function getThreadsForOutlets(outletIds: string[]): ChatThread[] {
  return getCollection<ChatThread>(KEYS.chatThreads).filter((t) => outletIds.includes(t.outletId));
}

export function getOrCreateThread(customerId: string, outletId: string): ChatThread {
  const threads = getCollection<ChatThread>(KEYS.chatThreads);
  const existing = threads.find((t) => t.customerId === customerId && t.outletId === outletId);
  if (existing) return existing;
  const thread: ChatThread = { id: `t-${Date.now()}`, customerId, outletId, lastMessageAt: new Date().toISOString() };
  setCollection(KEYS.chatThreads, [...threads, thread]);
  const messages = getCollection<ChatMessage>(KEYS.chatMessages);
  const welcome: ChatMessage = {
    id: `m-${Date.now()}`, threadId: thread.id, senderId: outletId, senderRole: "vendor",
    text: "Welcome! Thanks for your interest. Any questions?", sentAt: new Date().toISOString(),
  };
  setCollection(KEYS.chatMessages, [...messages, welcome]);
  return thread;
}

export function getMessages(threadId: string): ChatMessage[] {
  return getCollection<ChatMessage>(KEYS.chatMessages)
    .filter((m) => m.threadId === threadId)
    .sort((a, b) => a.sentAt.localeCompare(b.sentAt));
}

export function sendMessage(threadId: string, senderId: string, senderRole: "customer" | "vendor", text: string): ChatMessage {
  const messages = getCollection<ChatMessage>(KEYS.chatMessages);
  const message: ChatMessage = { id: `m-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, threadId, senderId, senderRole, text, sentAt: new Date().toISOString() };
  setCollection(KEYS.chatMessages, [...messages, message]);

  const threads = getCollection<ChatThread>(KEYS.chatThreads);
  setCollection(KEYS.chatThreads, threads.map((t) => (t.id === threadId ? { ...t, lastMessageAt: message.sentAt } : t)));
  return message;
}

// ─── Notifications ──────────────────────────────────────────────────────────
export function getNotifications(userId: string): Notification[] {
  return getCollection<Notification>(KEYS.notifications)
    .filter((n) => n.userId === userId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

// ─── Support tickets ────────────────────────────────────────────────────────
export function getSupportTickets(): SupportTicket[] {
  return getCollection<SupportTicket>(KEYS.supportTickets).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function resolveTicket(id: string): void {
  const tickets = getSupportTickets();
  setCollection(KEYS.supportTickets, tickets.map((t) => (t.id === id ? { ...t, status: "resolved" as const } : t)));
}

// ─── Verification tier (KYC review proxy) ──────────────────────────────────
export function setVerificationTier(userId: string, tier: User["verificationTier"]): void {
  const users = getUsers();
  setCollection(KEYS.users, users.map((u) => (u.id === userId ? { ...u, verificationTier: tier } : u)));
}
