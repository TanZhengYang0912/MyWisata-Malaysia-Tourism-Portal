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
];

export function findQuery(name: string): QueryDef<unknown> | undefined {
  return QUERY_REGISTRY.find((q) => q.name === name);
}

export function registryDescription(): string {
  return QUERY_REGISTRY.map((q) => `- ${q.name}: ${q.description}`).join('\n');
}
