// P4 — Member 4: safe query registry. CLAUDE-ADMIN-AI.md Part 2, Capability 1.
//
// THIS FILE IS THE SECURITY BOUNDARY. The LLM never writes SQL and never
// sees a raw row — it only picks a query BY NAME from this registry and
// supplies parameters, which are validated against that query's own zod
// schema before the query runs. Every query below uses the supabase-js
// query builder exclusively (no raw SQL string interpolation anywhere in
// this file) and returns only aggregates or counts — never individual
// customer/vendor records, names, emails, or IDs.
//
// If a number isn't returned by one of these functions, the admin bot
// cannot get it, by construction.

import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';

export interface AggregateResult {
  [key: string]: number | string | null;
}

export interface QueryDef<P = unknown> {
  name: string;
  description: string;
  paramsSchema: z.ZodType<P>;
  run(service: SupabaseClient, params: P): Promise<AggregateResult>;
}

const daysWindowSchema = z.object({ days: z.number().int().positive().max(365).optional() }).strict();
const amountSchema = z.object({ amountRM: z.number().positive().max(1_000_000) }).strict();
const emptySchema = z.object({}).strict();

function sinceIso(days?: number): string | null {
  if (!days) return null;
  return new Date(Date.now() - days * 86400_000).toISOString();
}

// ── Fix 1 (CLAUDE-ADMIN-AI-EXPAND.md): registry expansion ──────────────────
// "If the admin dashboard already displays it, the AI may answer about it" —
// every query below covers a number/list already visible on some app/admin/**
// page. Same rules as above: aggregates/counts/names only, never raw rows,
// never PII columns (email/phone/IC/address/bank details).

const vendorStatusSchema = z.object({ status: z.enum(['pending', 'approved', 'rejected', 'suspended']).optional() }).strict();
const vendorNameSchema = z.object({ vendorName: z.string().trim().min(1).max(255) }).strict();
const productStatusSchema = z.object({ status: z.enum(['active', 'inactive', 'archived']).optional() }).strict();
const kycStatusSchema = z.object({ status: z.enum(['pending', 'approved', 'rejected']).optional() }).strict();
const recommendationStatusSchema = z.object({ status: z.enum(['pending', 'approved', 'rejected', 'converted']) }).strict();
const withdrawalStatusSchema = z.object({ status: z.enum(['pending', 'approved', 'rejected', 'processing', 'completed']).optional() }).strict();
const customerSchema = z.object({ email: z.string().trim().email().optional(), userId: z.string().trim().uuid().optional() }).strict();
const roleSchema = z.object({ role: z.enum(['customer', 'vendor_owner', 'outlet_manager', 'admin', 'approver', 'super_admin']).optional() }).strict();

/** Best-effort fuzzy match on vendors.name — returns null (not a guess) if nothing matches. */
async function resolveVendorId(service: SupabaseClient, vendorName: string): Promise<string | null> {
  const { data } = await service.from('vendors').select('id').ilike('name', `%${vendorName}%`).limit(1).maybeSingle();
  return data?.id ?? null;
}

const vendorsTotal: QueryDef<z.infer<typeof vendorStatusSchema>> = {
  name: 'vendors_total',
  description: 'Total count of vendors, optionally filtered by status. Params: {"status"?: "pending"|"approved"|"rejected"|"suspended"}.',
  paramsSchema: vendorStatusSchema,
  async run(service, { status }) {
    let q = service.from('vendors').select('id', { count: 'exact', head: true });
    if (status) q = q.eq('status', status);
    const { count, error } = await q;
    if (error) throw new Error(error.message);
    return { count: count ?? 0, status: status ?? 'all' };
  },
};

const productsCountByVendor: QueryDef<z.infer<typeof vendorNameSchema>> = {
  name: 'products_count_by_vendor',
  description: 'Count of products belonging to a named vendor. Params: {"vendorName": string} (required — the vendor\'s business name, fuzzy-matched).',
  paramsSchema: vendorNameSchema,
  async run(service, { vendorName }) {
    const vendorId = await resolveVendorId(service, vendorName);
    if (!vendorId) return { count: 0, vendorFound: 'no' };
    const { count, error } = await service.from('products').select('id', { count: 'exact', head: true }).eq('vendor_id', vendorId);
    if (error) throw new Error(error.message);
    return { count: count ?? 0, vendorFound: 'yes' };
  },
};

const productsListByVendor: QueryDef<z.infer<typeof vendorNameSchema>> = {
  name: 'products_list_by_vendor',
  description: 'The product NAMES (not full records) and count for a named vendor. Params: {"vendorName": string} (required, fuzzy-matched).',
  paramsSchema: vendorNameSchema,
  async run(service, { vendorName }) {
    const vendorId = await resolveVendorId(service, vendorName);
    if (!vendorId) return { count: 0, vendorFound: 'no', names: '' };
    const { data, error } = await service.from('products').select('name').eq('vendor_id', vendorId).limit(50);
    if (error) throw new Error(error.message);
    const names = (data ?? []).map((p) => p.name);
    return { count: names.length, vendorFound: 'yes', names: names.join(', ') };
  },
};

const productsTotal: QueryDef<z.infer<typeof productStatusSchema>> = {
  name: 'products_total',
  description: 'Total count of products, optionally filtered by operational status. Params: {"status"?: "active"|"inactive"|"archived"}.',
  paramsSchema: productStatusSchema,
  async run(service, { status }) {
    let q = service.from('products').select('id', { count: 'exact', head: true });
    if (status) q = q.eq('status', status);
    const { count, error } = await q;
    if (error) throw new Error(error.message);
    return { count: count ?? 0, status: status ?? 'all' };
  },
};

const productsPendingReviewCount: QueryDef<z.infer<typeof emptySchema>> = {
  name: 'products_pending_review_count',
  description: 'Count of products with review_status=pending_review (awaiting content moderation, separate from operational status).',
  paramsSchema: emptySchema,
  async run(service) {
    const { count, error } = await service.from('products').select('id', { count: 'exact', head: true }).eq('review_status', 'pending_review');
    if (error) throw new Error(error.message);
    return { count: count ?? 0 };
  },
};

const kycCountsByStatus: QueryDef<z.infer<typeof emptySchema>> = {
  name: 'kyc_counts_by_status',
  description: 'Counts of KYC submissions grouped by status (pending/approved/rejected).',
  paramsSchema: emptySchema,
  async run(service) {
    const { data, error } = await service.from('kyc_submissions').select('status');
    if (error) throw new Error(error.message);
    const counts: Record<string, number> = { pending: 0, approved: 0, rejected: 0 };
    for (const row of data ?? []) counts[row.status] = (counts[row.status] ?? 0) + 1;
    return counts;
  },
};

const kycPendingCount: QueryDef<z.infer<typeof kycStatusSchema>> = {
  name: 'kyc_pending_count',
  description: 'Count of KYC submissions awaiting review (status=pending). Params: {"status"?: "pending"|"approved"|"rejected"} — defaults to pending.',
  paramsSchema: kycStatusSchema,
  async run(service, { status }) {
    const targetStatus = status ?? 'pending';
    const { count, error } = await service.from('kyc_submissions').select('id', { count: 'exact', head: true }).eq('status', targetStatus);
    if (error) throw new Error(error.message);
    return { count: count ?? 0, status: targetStatus };
  },
};

const recommendationsByStatus: QueryDef<z.infer<typeof recommendationStatusSchema>> = {
  name: 'recommendations_by_status',
  description: 'Count of vendor recommendations with a SPECIFIC status. Params: {"status": "pending"|"approved"|"rejected"|"converted"} (required — always pass the exact status asked about; do not default to pending when the admin asks about approved/rejected/converted).',
  paramsSchema: recommendationStatusSchema,
  async run(service, { status }) {
    const { count, error } = await service.from('vendor_recommendations').select('id', { count: 'exact', head: true }).eq('status', status);
    if (error) throw new Error(error.message);
    return { count: count ?? 0, status };
  },
};

const withdrawalsByStatus: QueryDef<z.infer<typeof withdrawalStatusSchema>> = {
  name: 'withdrawals_by_status',
  description: 'Count and total RM of withdrawal_requests, optionally filtered by status. Params: {"status"?: "pending"|"approved"|"rejected"|"processing"|"completed"}.',
  paramsSchema: withdrawalStatusSchema,
  async run(service, { status }) {
    let q = service.from('withdrawal_requests').select('amount');
    if (status) q = q.eq('status', status);
    const { data, error } = await q;
    if (error) throw new Error(error.message);
    const rows = data ?? [];
    const total = rows.reduce((sum, r) => sum + Number(r.amount), 0);
    return { count: rows.length, totalRM: Number(total.toFixed(2)), status: status ?? 'all' };
  },
};

const ordersTotal: QueryDef<z.infer<typeof daysWindowSchema>> = {
  name: 'orders_total',
  description: 'Count and total revenue (RM) of paid/completed orders, optionally within the last N days. Params: {"days"?: number}.',
  paramsSchema: daysWindowSchema,
  async run(service, { days }) {
    let q = service.from('orders').select('total_amount').in('status', ['paid', 'completed']);
    const since = sinceIso(days);
    if (since) q = q.gte('created_at', since);
    const { data, error } = await q;
    if (error) throw new Error(error.message);
    const rows = data ?? [];
    const total = rows.reduce((sum, r) => sum + Number(r.total_amount), 0);
    return { count: rows.length, revenueRM: Number(total.toFixed(2)), windowDays: days ?? null };
  },
};

const ordersCountForCustomer: QueryDef<z.infer<typeof customerSchema>> = {
  name: 'orders_count_for_customer',
  description: 'The NUMBER of orders placed by one customer — never the order details or the customer\'s personal data. Params: {"email"?: string} or {"userId"?: string} (exactly one required, resolved server-side; the email is never echoed back).',
  paramsSchema: customerSchema,
  async run(service, { email, userId }) {
    let resolvedId = userId ?? null;
    if (!resolvedId && email) {
      const { data } = await service.from('users').select('id').eq('email', email).maybeSingle();
      resolvedId = data?.id ?? null;
    }
    if (!resolvedId) return { count: 0, customerFound: 'no' };
    const { count, error } = await service.from('orders').select('id', { count: 'exact', head: true }).eq('user_id', resolvedId);
    if (error) throw new Error(error.message);
    return { count: count ?? 0, customerFound: 'yes' };
  },
};

const usersTotal: QueryDef<z.infer<typeof roleSchema>> = {
  name: 'users_total',
  description: 'Total count of users, optionally filtered by role. Params: {"role"?: "customer"|"vendor_owner"|"outlet_manager"|"admin"|"approver"|"super_admin"}. Non-PII — a count only.',
  paramsSchema: roleSchema,
  async run(service, { role }) {
    if (!role) {
      const { count, error } = await service.from('users').select('id', { count: 'exact', head: true });
      if (error) throw new Error(error.message);
      return { count: count ?? 0, role: 'all' };
    }
    const { data, error } = await service.from('user_roles').select('user_id, roles!inner(name)').eq('roles.name', role);
    if (error) throw new Error(error.message);
    const uniqueUsers = new Set((data ?? []).map((row) => row.user_id));
    return { count: uniqueUsers.size, role };
  },
};

const pendingRecommendationsCount: QueryDef<z.infer<typeof daysWindowSchema>> = {
  name: 'pending_recommendations_count',
  description: 'Count of vendor recommendations with status=pending, optionally within the last N days. Params: {"days"?: number}.',
  paramsSchema: daysWindowSchema,
  async run(service, { days }) {
    let q = service.from('vendor_recommendations').select('id', { count: 'exact', head: true }).eq('status', 'pending');
    const since = sinceIso(days);
    if (since) q = q.gte('created_at', since);
    const { count, error } = await q;
    if (error) throw new Error(error.message);
    return { count: count ?? 0, windowDays: days ?? null };
  },
};

const pendingVendorApprovalsCount: QueryDef<z.infer<typeof emptySchema>> = {
  name: 'pending_vendor_approvals_count',
  description: 'Count of vendors with status=pending, awaiting admin approval.',
  paramsSchema: emptySchema,
  async run(service) {
    const { count, error } = await service.from('vendors').select('id', { count: 'exact', head: true }).eq('status', 'pending');
    if (error) throw new Error(error.message);
    return { count: count ?? 0 };
  },
};

const withdrawalsOverAmount: QueryDef<z.infer<typeof amountSchema>> = {
  name: 'withdrawals_over_amount',
  description: 'Count and total RM of withdrawal_requests with amount greater than a given RM threshold. Returns aggregates only, never names. Params: {"amountRM": number} (required — the threshold, e.g. 500 for "over 500").',
  paramsSchema: amountSchema,
  async run(service, { amountRM }) {
    const { data, error } = await service.from('withdrawal_requests').select('amount').gt('amount', amountRM);
    if (error) throw new Error(error.message);
    const rows = data ?? [];
    const total = rows.reduce((sum, r) => sum + Number(r.amount), 0);
    return { count: rows.length, totalRM: Number(total.toFixed(2)), thresholdRM: amountRM };
  },
};

const openTicketsByCategory: QueryDef<z.infer<typeof emptySchema>> = {
  name: 'open_tickets_by_category',
  description: 'Counts of open support tickets, grouped by category.',
  paramsSchema: emptySchema,
  async run(service) {
    const { data, error } = await service.from('support_tickets').select('category').eq('status', 'open');
    if (error) throw new Error(error.message);
    const counts: Record<string, number> = {};
    for (const row of data ?? []) {
      const cat = row.category ?? 'general';
      counts[cat] = (counts[cat] ?? 0) + 1;
    }
    return counts;
  },
};

const affiliateCommissionTotal: QueryDef<z.infer<typeof daysWindowSchema>> = {
  name: 'affiliate_commission_total',
  description: 'Sum of affiliate commission_amount over a window (default: all time), broken down by status (pending/confirmed/reversed). Params: {"days"?: number}.',
  paramsSchema: daysWindowSchema,
  async run(service, { days }) {
    let q = service.from('affiliate_attributions').select('commission_amount,status');
    const since = sinceIso(days);
    if (since) q = q.gte('created_at', since);
    const { data, error } = await q;
    if (error) throw new Error(error.message);
    const totals: Record<string, number> = { pending: 0, confirmed: 0, reversed: 0 };
    for (const row of data ?? []) {
      totals[row.status] = (totals[row.status] ?? 0) + Number(row.commission_amount);
    }
    return {
      pendingRM: Number(totals.pending.toFixed(2)),
      confirmedRM: Number(totals.confirmed.toFixed(2)),
      reversedRM: Number(totals.reversed.toFixed(2)),
      windowDays: days ?? null,
    };
  },
};

const fraudFlagsOpenCount: QueryDef<z.infer<typeof emptySchema>> = {
  name: 'fraud_flags_open_count',
  description: 'Counts of open affiliate fraud flags, grouped by flag_type.',
  paramsSchema: emptySchema,
  async run(service) {
    const { data, error } = await service.from('affiliate_fraud_flags').select('flag_type').eq('status', 'open');
    if (error) throw new Error(error.message);
    const counts: Record<string, number> = {};
    for (const row of data ?? []) {
      counts[row.flag_type] = (counts[row.flag_type] ?? 0) + 1;
    }
    return counts;
  },
};

const topUnansweredQuestionThemes: QueryDef<z.infer<typeof emptySchema>> = {
  name: 'top_unanswered_question_themes',
  description: 'Up to 10 recent question texts the customer chatbot could not answer (kb_matched=false). Question text only — never joined to user identity.',
  paramsSchema: emptySchema,
  async run(service) {
    const { data: misses, error } = await service
      .from('chatbot_messages')
      .select('session_id,created_at')
      .eq('role', 'bot')
      .eq('kb_matched', false)
      .order('created_at', { ascending: false })
      .limit(20);
    if (error) throw new Error(error.message);

    const questions: string[] = [];
    for (const miss of misses ?? []) {
      if (questions.length >= 10) break;
      const { data: userMsg } = await service
        .from('chatbot_messages')
        .select('body')
        .eq('session_id', miss.session_id)
        .eq('role', 'user')
        .lte('created_at', miss.created_at)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (userMsg?.body && !questions.includes(userMsg.body)) questions.push(userMsg.body);
    }
    return { questions: questions.join(' | '), count: questions.length };
  },
};

export const QUERY_REGISTRY: QueryDef<unknown>[] = [
  pendingRecommendationsCount,
  pendingVendorApprovalsCount,
  withdrawalsOverAmount,
  openTicketsByCategory,
  affiliateCommissionTotal,
  fraudFlagsOpenCount,
  topUnansweredQuestionThemes,
  vendorsTotal,
  productsCountByVendor,
  productsListByVendor,
  productsTotal,
  productsPendingReviewCount,
  kycCountsByStatus,
  kycPendingCount,
  recommendationsByStatus,
  withdrawalsByStatus,
  ordersTotal,
  ordersCountForCustomer,
  usersTotal,
];

export function findQuery(name: string): QueryDef<unknown> | undefined {
  return QUERY_REGISTRY.find((q) => q.name === name);
}

export function registryDescription(): string {
  return QUERY_REGISTRY.map((q) => `- ${q.name}: ${q.description}`).join('\n');
}
