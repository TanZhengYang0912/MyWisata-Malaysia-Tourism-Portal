// Owner: Member 1 (Platform/Identity/Chat)
import { supabase } from "@/backend/supabase";
import type { ChatMessage, ChatThread, Role, SupportTicket, User } from "@/backend/core/types";
import { getCurrentUserId, setCurrentUserId } from "@/backend/domains/current-user";

type UserRow = {
  id: string;
  email: string;
  full_name: string | null;
  city: string | null;
  kyc_status: string;
  user_roles: { vendor_id: string | null; outlet_id: string | null; roles: { name: string } | null }[];
};

const USER_SELECT = "id,email,full_name,city,kyc_status,user_roles(vendor_id,outlet_id,roles(name))";

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
    verificationTier: row.kyc_status as User["verificationTier"],
    vendorId: ur?.vendor_id ?? undefined,
    outletId: ur?.outlet_id ?? undefined,
  };
}

export async function getUsers(): Promise<User[]> {
  const { data, error } = await supabase.from("users").select(USER_SELECT);
  if (error) throw error;
  return (data as unknown as UserRow[]).map(mapUser);
}

export async function getUser(id: string): Promise<User | undefined> {
  const { data, error } = await supabase.from("users").select(USER_SELECT).eq("id", id).maybeSingle();
  if (error) throw error;
  return data ? mapUser(data as unknown as UserRow) : undefined;
}

export { getCurrentUserId, setCurrentUserId };

export async function getCurrentUser(): Promise<User | null> {
  const id = getCurrentUserId();
  if (!id) return null;
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

// ─── Verification tier (KYC review proxy) ──────────────────────────────────
export async function setVerificationTier(userId: string, tier: User["verificationTier"]): Promise<void> {
  const { error } = await supabase.from("users").update({ kyc_status: tier }).eq("id", userId);
  if (error) throw error;
}
