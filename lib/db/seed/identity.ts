// Owner: Member 1 (Platform/Identity/Chat)
import type { ChatMessage, ChatThread, SupportTicket, User } from "@/lib/types";

// Customer first: seedAll() uses users[0] as the default logged-in demo user.
export const USERS: User[] = [
  { id: "u5", name: "Aisyah Rahman", email: "aisyah@demo.my", role: "customer", avatarInitial: "A", city: "Kuala Lumpur", verificationTier: "kyc_verified" },
  { id: "u6", name: "Ravi Kumar", email: "ravi@demo.my", role: "customer", avatarInitial: "R", city: "Penang", verificationTier: "profile_complete" },
  { id: "u7", name: "Mei Ling Tan", email: "meiling@demo.my", role: "customer", avatarInitial: "M", city: "Johor Bahru", verificationTier: "phone_verified" },
  { id: "u8", name: "John Lim", email: "john@demo.my", role: "customer", avatarInitial: "J", city: "Melaka", verificationTier: "registered" },
  { id: "u3", name: "Ahmad Faiz", email: "ahmad@demo.my", role: "vendor_owner", avatarInitial: "A", verificationTier: "kyc_verified", vendorId: "v1" },
  { id: "u4", name: "Siti Nurhaliza", email: "siti@demo.my", role: "outlet_manager", avatarInitial: "S", verificationTier: "kyc_verified", outletId: "o3" },
  { id: "u2", name: "Zul Hakim", email: "zul@demo.my", role: "approver", avatarInitial: "Z", verificationTier: "kyc_verified" },
  { id: "u1", name: "Farah Nabilah", email: "farah@demo.my", role: "super_admin", avatarInitial: "F", verificationTier: "kyc_verified" },
];

export const CHAT_THREADS: ChatThread[] = [
  { id: "t1", customerId: "u5", outletId: "o1", lastMessageAt: "2026-07-08T10:30:00Z" },
  { id: "t2", customerId: "u6", outletId: "o2", lastMessageAt: "2026-07-09T15:05:00Z" },
];

export const CHAT_MESSAGES: ChatMessage[] = [
  { id: "m1", threadId: "t1", senderId: "o1", senderRole: "vendor", text: "Welcome! Thanks for your interest in Penang Street Food Trail. Any questions?", sentAt: "2026-07-08T09:00:00Z" },
  { id: "m2", threadId: "t1", senderId: "u5", senderRole: "customer", text: "Is the tour halal-certified food only?", sentAt: "2026-07-08T10:30:00Z" },
  { id: "m3", threadId: "t2", senderId: "o2", senderRole: "vendor", text: "Welcome! Thanks for your interest in Langkawi Island Hopping. Any questions?", sentAt: "2026-07-09T14:00:00Z" },
  { id: "m4", threadId: "t2", senderId: "u6", senderRole: "customer", text: "Can we join with kids under 5?", sentAt: "2026-07-09T15:05:00Z" },
  { id: "m5", threadId: "t2", senderId: "o2", senderRole: "vendor", text: "Yes, children under 5 go free with an adult ticket!", sentAt: "2026-07-09T15:20:00Z" },
];

export const SUPPORT_TICKETS: SupportTicket[] = [
  { id: "tk1", userId: "u7", category: "Voucher issue", subject: "Voucher not applying at checkout", status: "open", createdAt: "2026-07-08T12:00:00Z" },
  { id: "tk2", userId: "u8", category: "Booking issue", subject: "Wrong date shown on my confirmed booking", status: "resolved", createdAt: "2026-07-05T09:30:00Z" },
];
