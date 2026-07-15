// Owner: Member 1 (Platform/Identity/Chat)
import { supabase } from "@/backend/supabase";
import type { AdminKycSubmission, ChatMessage, ChatThread, PublicUser, Role, SupportTicket, User } from "@/backend/core/types";
import { getCurrentUserId, setCurrentUserId, setCurrentUser, getStoredCurrentUser } from "@/backend/domains/current-user";

type UserRow = {
  id: string;
  email: string;
  full_name: string | null;
  city: string | null;
  phone: string | null;
  tier: string;
  user_roles: { vendor_id: string | null; outlet_id: string | null; roles: { name: string } | null }[];
};

const USER_SELECT = "id,email,full_name,city,phone,tier,user_roles(vendor_id,outlet_id,roles(name))";

// Explicit allow-list for public identity data. Never replace this with a
// users.* query: the public_users view is the column-level KYC boundary.
const PUBLIC_USER_SELECT = "id,full_name,display_name,avatar_url,city,country,is_kyc_verified,created_at";

type PublicUserRow = {
  id: string;
  full_name: string | null;
  display_name: string | null;
  avatar_url: string | null;
  city: string | null;
  country: string | null;
  is_kyc_verified: boolean;
  created_at: string;
};

function mapPublicUser(row: PublicUserRow): PublicUser {
  return {
    id: row.id,
    name: row.display_name?.trim() || row.full_name?.trim() || "MyWisata member",
    avatarUrl: row.avatar_url ?? undefined,
    city: row.city ?? undefined,
    country: row.country ?? undefined,
    isKycVerified: Boolean(row.is_kyc_verified),
  };
}

/** Fetches only active, public-safe identity fields for contributor cards. */
export async function getPublicUsers(ids: string[]): Promise<PublicUser[]> {
  if (ids.length === 0) return [];
  const { data, error } = await supabase.from("public_users").select(PUBLIC_USER_SELECT).in("id", ids);
  if (error) throw error;
  return (data as unknown as PublicUserRow[]).map(mapPublicUser);
}

function mapUser(row: UserRow): User {
  const ur = row.user_roles[0];
  const name = row.full_name ?? row.email;
  return {
    id: row.id,
    name,
    email: row.email,
    role: (ur?.roles?.name ?? "customer") as Role,
    avatarInitial: name[0]?.toUpperCase() ?? "?",
    city: row.city ?? undefined,
    phone: row.phone ?? undefined,
    verificationTier: (row.tier ?? "email_verified") as User["verificationTier"],
    vendorId: ur?.vendor_id ?? undefined,
    outletId: ur?.outlet_id ?? undefined,
  };
}

// Hardcoded demo users — only active in development. In production all auth must
// come from Supabase so there are no backdoor accounts.
const DEMO_USERS: User[] = process.env.NODE_ENV === 'production' ? [] : [
  { id: "demo-customer-1", name: "Demo Customer", email: "customer@demo.local", role: "customer", avatarInitial: "C", verificationTier: "email_verified" },
  { id: "demo-vendor-1", name: "Demo Vendor Owner", email: "vendor@demo.local", role: "vendor_owner", avatarInitial: "V", verificationTier: "kyc_verified" },
  { id: "demo-admin-1", name: "Demo Admin", email: "admin@demo.local", role: "admin", avatarInitial: "A", verificationTier: "kyc_verified" },
  { id: "demo-approver-1", name: "Demo Approver", email: "approver@demo.local", role: "approver", avatarInitial: "P", verificationTier: "kyc_verified" },
];

export async function getUsers(): Promise<User[]> {
  try {
    const { data, error } = await supabase.from("users").select(USER_SELECT);
    if (error) throw error;
    const real = (data as unknown as UserRow[]).map(mapUser);
    const existingRoles = new Set(real.map((u) => u.role));
    const missing = DEMO_USERS.filter((u) => !existingRoles.has(u.role));
    return [...real, ...missing];
  } catch {
    return DEMO_USERS;
  }
}

export async function getUser(id: string): Promise<User | undefined> {
  // Check demo users first so mock IDs always resolve.
  const demo = DEMO_USERS.find((u) => u.id === id);
  if (demo) return demo;
  const { data, error } = await supabase.from("users").select(USER_SELECT).eq("id", id).maybeSingle();
  if (error) throw error;
  return data ? mapUser(data as unknown as UserRow) : undefined;
}

export { getCurrentUserId, setCurrentUserId, setCurrentUser };

export async function getCurrentUser(): Promise<User | null> {
  const id = getCurrentUserId();
  if (!id) return null;
  // Prefer the stored User object so mock/demo users survive a page refresh.
  const stored = getStoredCurrentUser(id);
  if (stored) return stored;
  return (await getUser(id)) ?? null;
}

// ─── Chat ───────────────────────────────────────────────────────────────────
function mapThread(row: { id: string; customer_id: string; outlet_id: string; last_message_at: string | null; created_at: string }): ChatThread {
  return { id: row.id, customerId: row.customer_id, outletId: row.outlet_id, lastMessageAt: row.last_message_at ?? row.created_at };
}

export async function getThread(threadId: string): Promise<ChatThread | undefined> {
  const { data, error } = await supabase.from("chat_threads").select("*").eq("id", threadId).maybeSingle();
  if (error) throw error;
  return data ? mapThread(data) : undefined;
}

export async function getThreadsForUser(userId: string): Promise<ChatThread[]> {
  const { data, error } = await supabase.from("chat_threads").select("*").eq("customer_id", userId);
  if (error) throw error;
  return (data ?? []).map(mapThread);
}

export async function getThreadsForOutlets(outletIds: string[]): Promise<ChatThread[]> {
  if (outletIds.length === 0) return [];
  const { data, error } = await supabase.from("chat_threads").select("*").in("outlet_id", outletIds);
  if (error) throw error;
  return (data ?? []).map(mapThread);
}

export async function getOrCreateThread(customerId: string, outletId: string): Promise<ChatThread> {
  const { data: existing, error: findErr } = await supabase
    .from("chat_threads")
    .select("*")
    .eq("customer_id", customerId)
    .eq("outlet_id", outletId)
    .maybeSingle();
  if (findErr) throw findErr;
  if (existing) return mapThread(existing);

  // The chat_threads_welcome trigger sends the vendor's welcome message —
  // it runs SECURITY DEFINER so it isn't blocked by chat_messages'
  // sender_id = auth.uid() insert policy the way a client-side insert would be.
  const { data: created, error: createErr } = await supabase
    .from("chat_threads")
    .insert({ customer_id: customerId, outlet_id: outletId })
    .select("*")
    .single();
  if (createErr) throw createErr;

  return mapThread(created);
}

export async function getMessages(threadId: string): Promise<ChatMessage[]> {
  const { data: thread, error: threadErr } = await supabase
    .from("chat_threads")
    .select("customer_id")
    .eq("id", threadId)
    .single();
  if (threadErr) throw threadErr;

  const { data, error } = await supabase
    .from("chat_messages")
    .select("*")
    .eq("thread_id", threadId)
    .order("created_at");
  if (error) throw error;

  return (data ?? []).map((m) => ({
    id: m.id,
    threadId: m.thread_id,
    senderId: m.sender_id,
    senderRole: m.sender_id === thread.customer_id ? ("customer" as const) : ("vendor" as const),
    text: m.body,
    sentAt: m.created_at,
    attachmentUrl: m.attachment_url ?? undefined,
    replyToId: m.reply_to_message_id ?? undefined,
  }));
}

export async function getReadChatMessageIds(userId: string, messageIds: string[]): Promise<Set<string>> {
  if (messageIds.length === 0) return new Set();
  const { data, error } = await supabase
    .from("chat_message_reads")
    .select("message_id")
    .eq("user_id", userId)
    .in("message_id", messageIds);
  if (error) throw error;
  return new Set((data ?? []).map((row) => row.message_id as string));
}

/** Message ids (from `messageIds`) that someone other than `myUserId` has read — powers the ✓✓ receipt. */
export async function getOtherReadMessageIds(myUserId: string, messageIds: string[]): Promise<Set<string>> {
  if (messageIds.length === 0) return new Set();
  const { data, error } = await supabase
    .from("chat_message_reads")
    .select("message_id")
    .in("message_id", messageIds)
    .neq("user_id", myUserId);
  if (error) throw error;
  return new Set((data ?? []).map((row) => row.message_id as string));
}

export async function sendMessage(threadId: string, senderId: string, senderRole: "customer" | "vendor", text: string, replyToId?: string): Promise<ChatMessage> {
  const { data, error } = await supabase
    .from("chat_messages")
    .insert({ thread_id: threadId, sender_id: senderId, body: text, reply_to_message_id: replyToId ?? null })
    .select("*")
    .single();
  if (error) throw error;

  await supabase.from("chat_threads").update({ last_message_at: data.created_at }).eq("id", threadId);

  return { id: data.id, threadId: data.thread_id, senderId: data.sender_id, senderRole, text: data.body, sentAt: data.created_at, replyToId: data.reply_to_message_id ?? undefined };
}

// ─── Support tickets ────────────────────────────────────────────────────────
export async function getSupportTickets(): Promise<SupportTicket[]> {
  const { data, error } = await supabase.from("support_tickets").select("*").order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map((t) => ({
    id: t.id,
    userId: t.user_id,
    category: t.body,
    subject: t.subject,
    status: t.status as SupportTicket["status"],
    createdAt: t.created_at,
  }));
}

export async function resolveTicket(id: string): Promise<void> {
  const { error } = await supabase.from("support_tickets").update({ status: "resolved", resolved_at: new Date().toISOString() }).eq("id", id);
  if (error) throw error;
}

// ─── Profile update ─────────────────────────────────────────────────────────
export async function updateProfile(userId: string, data: { fullName: string; city: string; phone: string }): Promise<User> {
  const isDemo = DEMO_USERS.some((u) => u.id === userId);
  if (!isDemo) {
    const { error } = await supabase
      .from("users")
      .update({ full_name: data.fullName, city: data.city, phone: data.phone })
      .eq("id", userId);
    if (error) throw error;
    // Re-fetch from DB so the trigger-updated kyc_status is reflected
    const fresh = await getUser(userId);
    if (!fresh) throw new Error("User not found after profile update");
    setCurrentUser(fresh);
    return fresh;
  }
  // Demo user: update in-memory only (no DB write)
  const current = await getCurrentUser();
  if (!current || current.id !== userId) throw new Error("User not found");
  const updated: User = {
    ...current,
    name: data.fullName.trim() || current.name,
    avatarInitial: (data.fullName.trim() || current.name)[0]?.toUpperCase() ?? "?",
    city: data.city,
    phone: data.phone,
  };
  setCurrentUser(updated);
  return updated;
}

// ─── KYC submissions ────────────────────────────────────────────────────────
export const KYC_ACCEPTED_TYPES = ["image/jpeg", "image/png", "application/pdf"];
export const KYC_MAX_FILE_SIZE = 5 * 1024 * 1024; // 5 MB

export function validateKycFile(file: File | null): string | null {
  if (!file) return "Please upload a document photo";
  if (!KYC_ACCEPTED_TYPES.includes(file.type)) return "File must be JPG, PNG, or PDF";
  if (file.size > KYC_MAX_FILE_SIZE) return `File must be under 5 MB (current: ${(file.size / 1024 / 1024).toFixed(1)} MB)`;
  return null;
}

export async function getKycSubmissions(): Promise<AdminKycSubmission[]> {
  // Admin metadata deliberately exposes document sides, never raw object paths.
  const { data, error } = await supabase
    .from("kyc_submissions")
    .select("id,user_id,document_type,status,queue_position,created_at,reviewed_at,reviewer_id,review_reason_code,review_reason_detail,kyc_submission_documents(side)")
    .in("status", ["pending", "info_requested"])
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data ?? []).map((r) => ({
    id: r.id,
    userId: r.user_id,
    docType: r.document_type ?? "",
    status: r.status as AdminKycSubmission["status"],
    queuePosition: r.queue_position ?? null,
    submittedAt: r.created_at,
    reviewedAt: r.reviewed_at ?? null,
    reviewedBy: r.reviewer_id ?? null,
    reviewReasonCode: r.review_reason_code ?? null,
    reviewReasonDetail: r.review_reason_detail ?? null,
    documents: ((r as { kyc_submission_documents?: { side: "front" | "back" }[] }).kyc_submission_documents ?? []).map(({ side }) => ({ side })),
  }));
}

export async function recordKycReview(userId: string, reviewedBy: string, approved: boolean): Promise<void> {
  const { error } = await supabase
    .from("kyc_submissions")
    .update({
      reviewed_at: new Date().toISOString(),
      reviewer_id: reviewedBy,
      status: approved ? "approved" : "rejected",
    })
    .eq("user_id", userId);
  if (error) throw error;
}

// ─── Verification tier (KYC review proxy) ──────────────────────────────────
export async function setVerificationTier(userId: string, tier: User["verificationTier"]): Promise<void> {
  const isDemo = DEMO_USERS.some((u) => u.id === userId);
  if (!isDemo) {
    const { error } = await supabase.from("users").update({ tier }).eq("id", userId);
    if (error) throw error;
  }
  // Keep localStorage in sync so demo users and page-refreshes see the updated tier.
  const current = await getCurrentUser();
  if (current && current.id === userId) {
    setCurrentUser({ ...current, verificationTier: tier });
  }
  // Auto-provision affiliate link when user reaches full KYC. SECURITY DEFINER
  // RPC handles the idempotency — safe to call even if a link already exists.
  if (tier === "kyc_verified") {
    await supabase.rpc("gen_affiliate_code", { p_user_id: userId }).then(() => undefined);
  }
}
