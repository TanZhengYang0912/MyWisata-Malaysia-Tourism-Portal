// Owner: Member 1 (Platform/Identity/Chat)
import { supabase } from "@/backend/supabase";
import type { ChatMessage, ChatThread, KycSubmission, Role, SupportTicket, User } from "@/backend/core/types";
import { getCurrentUserId, setCurrentUserId, setCurrentUser, getStoredCurrentUser } from "@/backend/domains/current-user";

type UserRow = {
  id: string;
  email: string;
  full_name: string | null;
  city: string | null;
  phone: string | null;
  kyc_status: string;
  user_roles: { vendor_id: string | null; outlet_id: string | null; roles: { name: string } | null }[];
};

const USER_SELECT = "id,email,full_name,city,phone,kyc_status,user_roles(vendor_id,outlet_id,roles(name))";

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
    verificationTier: row.kyc_status as User["verificationTier"],
    vendorId: ur?.vendor_id ?? undefined,
    outletId: ur?.outlet_id ?? undefined,
  };
}

// Hardcoded demo users — only active in development. In production all auth must
// come from Supabase so there are no backdoor accounts.
const DEMO_USERS: User[] = process.env.NODE_ENV === 'production' ? [] : [
  { id: "demo-customer-1", name: "Demo Customer", email: "customer@demo.local", role: "customer", avatarInitial: "C", verificationTier: "registered" },
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

  const { data: created, error: createErr } = await supabase
    .from("chat_threads")
    .insert({ customer_id: customerId, outlet_id: outletId })
    .select("*")
    .single();
  if (createErr) throw createErr;

  // Welcome message is sent "as the vendor" — chat_messages.sender_id is a users.id,
  // so we use the outlet's vendor owner as the sender (outlets have no login of their own).
  const { data: outlet } = await supabase.from("outlets").select("vendor_id").eq("id", outletId).single();
  const { data: vendor } = outlet
    ? await supabase.from("vendors").select("owner_id").eq("id", outlet.vendor_id).single()
    : { data: null };
  if (vendor) {
    await supabase.from("chat_messages").insert({
      thread_id: created.id,
      sender_id: vendor.owner_id,
      body: "Welcome! Thanks for your interest. Any questions?",
    });
  }
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
  }));
}

export async function sendMessage(threadId: string, senderId: string, senderRole: "customer" | "vendor", text: string): Promise<ChatMessage> {
  const { data, error } = await supabase
    .from("chat_messages")
    .insert({ thread_id: threadId, sender_id: senderId, body: text })
    .select("*")
    .single();
  if (error) throw error;

  await supabase.from("chat_threads").update({ last_message_at: data.created_at }).eq("id", threadId);

  return { id: data.id, threadId: data.thread_id, senderId: data.sender_id, senderRole, text: data.body, sentAt: data.created_at };
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
const KYC_BUCKET = "kyc-documents";
export const KYC_ACCEPTED_TYPES = ["image/jpeg", "image/png", "application/pdf"];
export const KYC_MAX_FILE_SIZE = 5 * 1024 * 1024; // 5 MB
const KYC_SIGNED_URL_TTL = 3600; // 1 hour

export function validateKycFile(file: File | null): string | null {
  if (!file) return "Please upload a document photo";
  if (!KYC_ACCEPTED_TYPES.includes(file.type)) return "File must be JPG, PNG, or PDF";
  if (file.size > KYC_MAX_FILE_SIZE) return `File must be under 5 MB (current: ${(file.size / 1024 / 1024).toFixed(1)} MB)`;
  return null;
}

export async function uploadKycDocument(userId: string, file: File): Promise<string> {
  const ext = (file.name.split(".").pop() ?? "bin").toLowerCase();
  const path = `${userId}/document.${ext}`;
  const { error } = await supabase.storage.from(KYC_BUCKET).upload(path, file, {
    upsert: true,
    contentType: file.type,
  });
  if (error) throw error;
  return path;
}

export async function getKycDocumentSignedUrl(path: string): Promise<string> {
  const { data, error } = await supabase.storage.from(KYC_BUCKET).createSignedUrl(path, KYC_SIGNED_URL_TTL);
  if (error) throw error;
  return data.signedUrl;
}

export async function upsertKycSubmission(userId: string, data: { icNumber: string; docType: string; documentUrl: string }): Promise<void> {
  const isDemo = DEMO_USERS.some((u) => u.id === userId);
  if (isDemo) return;
  const { error } = await supabase.from("kyc_submissions").upsert(
    { user_id: userId, ic_number: data.icNumber, document_type: data.docType, document_url: data.documentUrl, status: "pending" },
    { onConflict: "user_id" }
  );
  if (error) throw error;
}

export async function getKycSubmissions(): Promise<KycSubmission[]> {
  const { data, error } = await supabase
    .from("kyc_submissions")
    .select("user_id,ic_number,document_type,document_url,created_at,reviewed_at,reviewer_id");
  if (error) throw error;
  return (data ?? []).map((r) => ({
    userId: r.user_id,
    icNumber: r.ic_number ?? "",
    docType: r.document_type ?? "",
    documentUrl: r.document_url ?? "",
    submittedAt: r.created_at,
    reviewedAt: r.reviewed_at ?? undefined,
    reviewedBy: r.reviewer_id ?? undefined,
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
    const { error } = await supabase.from("users").update({ kyc_status: tier }).eq("id", userId);
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
