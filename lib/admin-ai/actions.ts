// Admin AI agent: read-only record lists and action PROPOSALS.
//
// The agent never changes data. propose_action validates what the model asked
// for, checks the target exists, and returns a confirm card. The card holds
// the exact request for an existing admin API route; it runs only when the
// Super Admin presses Confirm, from their own browser session, so that
// route's own role, validation, moderation and audit checks all apply.
//
// Only low-risk, reversible operations are listed here (no money, roles,
// identity, account status or platform-wide switches). Adding one means
// adding it to ACTION_SPECS; anything not there cannot be proposed.

import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { prepareStaffQuestionText } from '@/lib/chatbot/pii';
import { createKbDocumentSchema, createTicketReplySchema, updateTicketStatusSchema } from '@/lib/validation/chatbot-schemas';
import { addCustomWordSchema } from '@/lib/validation/moderation-schemas';
import { createHotelAmenitySchema, toggleHotelAmenitySchema } from '@/lib/validation/hotel-amenity-schemas';
import { contentReviewSchema } from '@/lib/validation/vendor-schemas';
import { vendorAnnouncementCreateSchema } from '@/lib/validation/schemas';

const LIST_LIMIT = 20;
const THREAD_REPLIES = 6;
const WITHHELD = '[withheld: may contain personal details]';
/** Date only: a time's digits ("2026-11-10 07:12") read as a phone number to the privacy check. Lists are already ordered. */
const day = (iso: string | null) => (iso ? iso.slice(0, 10) : null);
const uuid = z.string().uuid();

/** Free text from the database goes to Gemini only if it passes the staff privacy check. */
function safe(text: string | null | undefined): string | null {
  if (!text) return null;
  return prepareStaffQuestionText(text).allowed ? text : WITHHELD;
}

export const RECORD_KINDS = [
  'open_tickets', 'ticket_thread', 'kb_entries', 'event_exceptions', 'hotel_amenities', 'moderation_words',
  'pending_vendors', 'pending_recommendations', 'catalogue_queue', 'open_chat_reports', 'event_ads', 'sponsored_ads', 'event_stalls',
] as const;

/** A joined row's name; Supabase returns a to-one relation as an object or a one-item array. */
function relatedName(relation: unknown, key = 'name'): string | null {
  const row = (Array.isArray(relation) ? relation[0] : relation) as Record<string, unknown> | null | undefined;
  const value = row?.[key];
  return typeof value === 'string' ? value : null;
}
export type RecordKind = (typeof RECORD_KINDS)[number];

/** list_records: small, bounded lists the agent needs to pick a target. */
/**
 * list_records: small, bounded lists the agent needs to pick a target.
 * `active` narrows on/off lists to the items an on or off action applies to.
 */
export async function listRecords(service: SupabaseClient, kind: string, id?: string, active?: boolean): Promise<Record<string, unknown>> {
  if (kind === 'open_tickets') {
    const { data, error } = await service.from('support_tickets')
      .select('id, subject, category, status, created_at').in('status', ['open', 'in_progress'])
      .order('created_at', { ascending: false }).limit(LIST_LIMIT);
    if (error) throw new Error(error.message);
    return { tickets: (data ?? []).map((t) => ({ id: t.id, subject: safe(t.subject), category: t.category, status: t.status, created: day(t.created_at) })) };
  }
  if (kind === 'ticket_thread') {
    if (!uuid.safeParse(id).success) return { error: 'ticket_thread needs a ticket id' };
    const { data: ticket } = await service.from('support_tickets').select('id, subject, body, category, status').eq('id', id).maybeSingle();
    if (!ticket) return { error: 'ticket not found' };
    const { data: replies } = await service.from('support_ticket_replies')
      .select('sender_role, body, created_at').eq('ticket_id', id).order('created_at', { ascending: false }).limit(THREAD_REPLIES);
    return {
      ticket: { id: ticket.id, subject: safe(ticket.subject), message: safe(ticket.body), category: ticket.category, status: ticket.status },
      latestReplies: (replies ?? []).reverse().map((r) => ({ from: r.sender_role, text: safe(r.body) })),
    };
  }
  if (kind === 'kb_entries') {
    let query = service.from('chatbot_kb_documents').select('id, title, is_active');
    if (active !== undefined) query = query.eq('is_active', active);
    const { data, error } = await query.order('updated_at', { ascending: false }).limit(100);
    if (error) throw new Error(error.message);
    return { entries: (data ?? []).map((d) => ({ id: d.id, title: safe(d.title), active: d.is_active })) };
  }
  if (kind === 'event_exceptions') {
    const { data, error } = await service.from('event_order_exceptions')
      .select('id, kind, reason_code, assigned_to, due_at, created_at').eq('state', 'open')
      .order('created_at', { ascending: true }).limit(LIST_LIMIT);
    if (error) throw new Error(error.message);
    return { openCases: (data ?? []).map((c) => ({ id: c.id, kind: c.kind, reason: c.reason_code, claimed: Boolean(c.assigned_to), due: day(c.due_at), opened: day(c.created_at) })) };
  }
  if (kind === 'hotel_amenities') {
    let query = service.from('hotel_amenities').select('code, label_en, is_active');
    if (active !== undefined) query = query.eq('is_active', active);
    const { data, error } = await query.order('sort_order');
    if (error) throw new Error(error.message);
    return { amenities: (data ?? []).map((a) => ({ code: a.code, label: a.label_en, active: a.is_active })) };
  }
  if (kind === 'moderation_words') {
    let query = service.from('moderation_custom_words').select('id, term, category, is_active');
    if (active !== undefined) query = query.eq('is_active', active);
    const { data, error } = await query.order('created_at', { ascending: false }).limit(100);
    if (error) throw new Error(error.message);
    return { words: (data ?? []).map((w) => ({ id: w.id, term: w.term, category: w.category, active: w.is_active })) };
  }
  if (kind === 'pending_vendors') {
    const { data, error } = await service.from('vendors').select('id, name, created_at').eq('status', 'pending')
      .order('created_at', { ascending: true }).limit(LIST_LIMIT);
    if (error) throw new Error(error.message);
    return { vendors: (data ?? []).map((v) => ({ id: v.id, name: safe(v.name), applied: day(v.created_at) })) };
  }
  if (kind === 'pending_recommendations') {
    const { data, error } = await service.from('vendor_recommendations').select('id, vendor_name, created_at').eq('status', 'pending')
      .order('created_at', { ascending: true }).limit(LIST_LIMIT);
    if (error) throw new Error(error.message);
    return { recommendations: (data ?? []).map((r) => ({ id: r.id, business: safe(r.vendor_name), submitted: day(r.created_at) })) };
  }
  if (kind === 'catalogue_queue') {
    const { data, error } = await service.rpc('list_catalogue_review_queue', { p_page: 1, p_page_size: 10, p_entity_type: null });
    if (error) throw new Error(error.message);
    const items = (data as { items?: Record<string, unknown>[] } | null)?.items ?? [];
    return {
      pendingItems: items.map((item) => ({
        id: item.id,
        type: item.entityType,
        name: safe(String(item.name ?? '')),
        vendor: safe((item.vendors as { name?: string } | null)?.name),
        submitted: day(String(item.created_at ?? '')),
      })),
    };
  }
  if (kind === 'open_chat_reports') {
    const { data, error } = await service.from('chat_reports').select('id, reason, details, created_at').eq('status', 'open')
      .order('created_at', { ascending: true }).limit(LIST_LIMIT);
    if (error) throw new Error(error.message);
    return { reports: (data ?? []).map((r) => ({ id: r.id, reason: r.reason, details: safe(r.details), reported: day(r.created_at) })) };
  }
  if (kind === 'event_ads') {
    const { data, error } = await service.from('vendor_event_promotions').select('id, title, status, starts_on, ends_on').in('status', ['paid', 'paused'])
      .order('starts_on', { ascending: true }).limit(LIST_LIMIT);
    if (error) throw new Error(error.message);
    return { ads: (data ?? []).map((a) => ({ id: a.id, title: safe(a.title), status: a.status, starts: a.starts_on, ends: a.ends_on })) };
  }
  if (kind === 'sponsored_ads') {
    const { data, error } = await service.from('sponsored_discovery_placements').select('id, state, category_slug, ends_at, products(name)').eq('status', 'active')
      .order('ends_at', { ascending: true }).limit(LIST_LIMIT);
    if (error) throw new Error(error.message);
    return {
      placements: (data ?? []).map((p) => ({
        id: p.id,
        product: safe(relatedName(p.products)),
        state: p.state ?? 'all states',
        category: p.category_slug ?? 'all categories',
        ends: day(p.ends_at),
      })),
    };
  }
  if (kind === 'event_stalls') {
    const { data, error } = await service.from('promotion_campaign_vendors').select('id, stall_number, vendors(name), promotion_campaigns(title)').eq('status', 'approved')
      .order('updated_at', { ascending: false }).limit(LIST_LIMIT);
    if (error) throw new Error(error.message);
    return {
      stalls: (data ?? []).map((r) => ({
        id: r.id,
        booth: r.stall_number,
        vendor: safe(relatedName(r.vendors)),
        event: safe(relatedName(r.promotion_campaigns, 'title')),
      })),
    };
  }
  return { error: 'unknown kind' };
}

export interface ActionDetail {
  /** i18n key under admin:aiAssistant.fields */
  field: string;
  value: string;
}

export interface ProposedAction {
  /** Random per proposal, for React keys and the confirm state. */
  id: string;
  action: ActionName;
  details: ActionDetail[];
  request: { method: 'POST' | 'PATCH'; url: string; body?: Record<string, unknown> };
  /** Admin page to check the item on before confirming. */
  link?: string;
}

type Built = Omit<ProposedAction, 'id' | 'action'> | { error: string };
type Spec = { description: string; args: z.ZodType; build(service: SupabaseClient, args: never): Promise<Built> };

const activeSchema = z.object({ id: uuid, active: z.boolean() }).strict();
const yesNo = (value: boolean) => (value ? 'on' : 'off');

async function exists(service: SupabaseClient, table: string, column: string, value: string, select = column) {
  const { data } = await service.from(table).select(select).eq(column, value).maybeSingle();
  return data as Record<string, unknown> | null;
}

export const ACTION_SPECS = {
  create_kb_entry: {
    description: 'Add a chatbot knowledge base entry. Args: {"title": string, "body": string, "keywords": string[], "category"?: string}. It is saved turned off, so the admin can check it on the Chatbot page and turn it on. Write the body only from facts in search_help results or the admin request; if you have neither, ask the admin what it should say.',
    args: createKbDocumentSchema.omit({ isActive: true }),
    async build(_service, args: { title: string; body: string; keywords: string[]; category?: string | null }) {
      return {
        details: [{ field: 'title', value: args.title }, { field: 'body', value: args.body }, { field: 'keywords', value: args.keywords.join(', ') }],
        request: { method: 'POST', url: '/api/admin/chatbot/kb', body: { ...args, isActive: false } },
      };
    },
  },
  set_kb_entry_active: {
    description: 'Turn a knowledge base entry on or off. Args: {"id": entry id from list_records kb_entries, "active": boolean}.',
    args: activeSchema,
    async build(service, args: { id: string; active: boolean }) {
      const entry = await exists(service, 'chatbot_kb_documents', 'id', args.id, 'id, title, is_active');
      if (!entry) return { error: 'entry not found' };
      if (entry.is_active === args.active) return { error: `already ${yesNo(args.active)}` };
      return {
        details: [{ field: 'entry', value: String(entry.title) }, { field: 'active', value: yesNo(args.active) }],
        request: { method: 'PATCH', url: `/api/admin/chatbot/kb/${args.id}`, body: { isActive: args.active } },
      };
    },
  },
  reindex_kb: {
    description: 'Reindex the chatbot knowledge base so new or edited entries become searchable. Args: {}.',
    args: z.object({}).strict(),
    async build() {
      return { details: [], request: { method: 'POST', url: '/api/admin/chatbot/reindex' } };
    },
  },
  update_ticket: {
    description: 'Change a support ticket\'s status ("open"|"in_progress"|"resolved") and/or category ("booking"|"payment"|"vendor"|"withdrawal"|"affiliate"|"general"). Args: {"id": ticket id, "status"?: ..., "category"?: ...}.',
    args: z.object({ id: uuid }).extend({ status: z.enum(['open', 'in_progress', 'resolved']).optional(), category: z.enum(['booking', 'payment', 'vendor', 'withdrawal', 'affiliate', 'general']).optional() }).strict(),
    async build(service, args: { id: string; status?: string; category?: string }) {
      const { id, ...body } = args;
      if (!updateTicketStatusSchema.safeParse(body).success) return { error: 'give a status or a category' };
      const ticket = await exists(service, 'support_tickets', 'id', id, 'id, subject');
      if (!ticket) return { error: 'ticket not found' };
      return {
        details: [
          { field: 'ticket', value: String(ticket.subject) },
          ...(body.status ? [{ field: 'status', value: body.status }] : []),
          ...(body.category ? [{ field: 'category', value: body.category }] : []),
        ],
        request: { method: 'PATCH', url: `/api/admin/tickets/${id}`, body },
      };
    },
  },
  reply_to_ticket: {
    description: 'Send a reply to the customer on a support ticket. Read it with list_records ticket_thread first. Args: {"id": ticket id, "body": reply text, at most 2000 characters}. Never promise refunds, payouts or account changes.',
    args: z.object({ id: uuid }).merge(createTicketReplySchema).strict(),
    async build(service, args: { id: string; body: string }) {
      const ticket = await exists(service, 'support_tickets', 'id', args.id, 'id, subject');
      if (!ticket) return { error: 'ticket not found' };
      return {
        details: [{ field: 'ticket', value: String(ticket.subject) }, { field: 'message', value: args.body }],
        request: { method: 'POST', url: `/api/support/tickets/${args.id}/replies`, body: { body: args.body } },
      };
    },
  },
  mark_notifications_read: {
    description: 'Mark all of the admin\'s own staff notifications as read. Args: {}.',
    args: z.object({}).strict(),
    async build() {
      return { details: [], request: { method: 'POST', url: '/api/notifications/read-all?scope=staff' } };
    },
  },
  claim_event_exception: {
    description: 'Claim an open event exception case for the admin, optionally with a due date. Args: {"id": case id from list_records event_exceptions, "dueDate"?: "YYYY-MM-DD"}. Resolving a case is not available here.',
    args: z.object({ id: uuid, dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional() }).strict(),
    async build(service, args: { id: string; dueDate?: string }) {
      const found = await exists(service, 'event_order_exceptions', 'id', args.id, 'id, kind, state, version');
      if (!found || found.state !== 'open') return { error: 'open case not found' };
      // Malaysia end of day for the chosen date.
      const dueAt = args.dueDate ? `${args.dueDate}T23:59:00+08:00` : undefined;
      if (dueAt && Number.isNaN(Date.parse(dueAt))) return { error: 'invalid dueDate' };
      return {
        details: [{ field: 'case', value: String(found.kind) }, ...(args.dueDate ? [{ field: 'dueDate', value: args.dueDate }] : [])],
        request: { method: 'POST', url: `/api/admin/reconciliation/event-exceptions/${args.id}`, body: { action: 'claim', version: found.version, ...(dueAt ? { dueAt } : {}) } },
      };
    },
  },
  add_hotel_amenity: {
    description: 'Add a hotel amenity. Args: {"code": lowercase_with_underscores, "labelEn", "labelMs", "labelZh", "icon": a lucide icon name such as "wifi"}.',
    args: createHotelAmenitySchema,
    async build(_service, args: { code: string; labelEn: string; labelMs: string; labelZh: string; icon: string }) {
      return {
        details: [{ field: 'code', value: args.code }, { field: 'labelEn', value: args.labelEn }, { field: 'labelMs', value: args.labelMs }, { field: 'labelZh', value: args.labelZh }, { field: 'icon', value: args.icon }],
        request: { method: 'POST', url: '/api/admin/hotel-amenities', body: args },
      };
    },
  },
  set_hotel_amenity_active: {
    description: 'Turn a hotel amenity on or off. Args: {"code": amenity code, "active": boolean}.',
    args: z.object({ code: toggleHotelAmenitySchema.shape.code, active: z.boolean() }).strict(),
    async build(service, args: { code: string; active: boolean }) {
      const amenity = await exists(service, 'hotel_amenities', 'code', args.code, 'code, label_en, is_active');
      if (!amenity) return { error: 'amenity not found' };
      if (amenity.is_active === args.active) return { error: `already ${yesNo(args.active)}` };
      return {
        details: [{ field: 'code', value: `${amenity.label_en} (${args.code})` }, { field: 'active', value: yesNo(args.active) }],
        request: { method: 'PATCH', url: '/api/admin/hotel-amenities', body: { code: args.code, isActive: args.active } },
      };
    },
  },
  add_moderation_word: {
    description: 'Add a word to auto-censor. Args: {"term": string, "category": "profanity"|"slur", "language"?: string}.',
    args: addCustomWordSchema,
    async build(_service, args: { term: string; category: string; language?: string }) {
      return {
        details: [{ field: 'term', value: args.term }, { field: 'category', value: args.category }, ...(args.language ? [{ field: 'language', value: args.language }] : [])],
        request: { method: 'POST', url: '/api/admin/moderation-words', body: args },
      };
    },
  },
  set_moderation_word_active: {
    description: 'Turn a moderation word on or off (deleting is not available here). Args: {"id": word id from list_records moderation_words, "active": boolean}.',
    args: activeSchema,
    async build(service, args: { id: string; active: boolean }) {
      const word = await exists(service, 'moderation_custom_words', 'id', args.id, 'id, term, is_active');
      if (!word) return { error: 'word not found' };
      if (word.is_active === args.active) return { error: `already ${yesNo(args.active)}` };
      return {
        details: [{ field: 'term', value: String(word.term) }, { field: 'active', value: yesNo(args.active) }],
        request: { method: 'PATCH', url: `/api/admin/moderation-words/${args.id}`, body: { isActive: args.active } },
      };
    },
  },
  send_vendor_announcement: {
    description: 'Send an announcement to every vendor. Args: {"title": 3 to 160 characters, "body": 10 to 5000 characters}. Write only what the admin asked to announce; never add dates, prices or promises they did not give. It cannot be unsent.',
    args: vendorAnnouncementCreateSchema.pick({ title: true, body: true }).strict(),
    async build(_service, args: { title: string; body: string }) {
      return {
        details: [{ field: 'title', value: args.title }, { field: 'message', value: args.body }],
        request: { method: 'POST', url: '/api/admin/announcements', body: args },
        link: '/admin/announcements',
      };
    },
  },
  vendor_request_information: {
    description: 'Ask a pending vendor applicant for more information. Args: {"id": vendor id from list_records pending_vendors, "reason": what is needed, 5 to 500 characters}. Approving or rejecting is not available here.',
    args: z.object({ id: uuid, reason: z.string().trim().min(5).max(500) }).strict(),
    async build(service, args: { id: string; reason: string }) {
      const vendor = await exists(service, 'vendors', 'id', args.id, 'id, name, status');
      if (!vendor || vendor.status !== 'pending') return { error: 'pending vendor not found' };
      return {
        details: [{ field: 'vendor', value: String(vendor.name) }, { field: 'reason', value: args.reason }],
        request: { method: 'POST', url: `/api/admin/vendors/${args.id}/approve`, body: { action: 'request_information', reason: args.reason } },
        link: '/admin/vendors',
      };
    },
  },
  recommendation_request_changes: {
    description: 'Send a pending recommendation back to the submitter for changes. Args: {"id": recommendation id from list_records pending_recommendations, "customerMessage": what to change, 10 to 500 characters, "internalNote"?: staff-only note}. Approving or rejecting is not available here.',
    args: z.object({ id: uuid, customerMessage: z.string().trim().min(10).max(500), internalNote: z.string().trim().max(1000).optional() }).strict(),
    async build(service, args: { id: string; customerMessage: string; internalNote?: string }) {
      const rec = await exists(service, 'vendor_recommendations', 'id', args.id, 'id, vendor_name, status, updated_at');
      if (!rec || rec.status !== 'pending') return { error: 'pending recommendation not found' };
      return {
        details: [
          { field: 'recommendation', value: String(rec.vendor_name) },
          { field: 'message', value: args.customerMessage },
          ...(args.internalNote ? [{ field: 'note', value: args.internalNote }] : []),
        ],
        request: {
          method: 'POST',
          url: '/api/admin/recommendations/review',
          body: {
            recommendationId: args.id,
            expectedVersion: rec.updated_at,
            action: 'request_changes',
            customerMessage: args.customerMessage,
            ...(args.internalNote ? { internalNote: args.internalNote } : {}),
          },
        },
        link: `/admin/recommendations/${args.id}`,
      };
    },
  },
  review_catalogue_item: {
    description: 'Approve, request changes to, or reject a pending outlet, product or voucher. Args: {"type": "outlet"|"product"|"voucher", "id": item id from list_records catalogue_queue, "decision": "approve"|"change_requested"|"reject", "note"?: required (10 to 500 characters) unless approving}. Only propose a decision the admin stated.',
    args: z.object({ type: z.enum(['outlet', 'product', 'voucher']), id: uuid, decision: z.enum(['approve', 'change_requested', 'reject']), note: z.string().trim().max(500).optional() }).strict(),
    async build(service, args: { type: 'outlet' | 'product' | 'voucher'; id: string; decision: string; note?: string }) {
      const table = { outlet: 'outlets', product: 'products', voucher: 'vouchers' }[args.type];
      const item = await exists(service, table, 'id', args.id, 'id, name, review_status, updated_at');
      if (!item || item.review_status !== 'pending_review') return { error: 'pending item not found' };
      const body = { entityType: args.type, entityId: args.id, action: args.decision, ...(args.note ? { note: args.note } : {}), expectedVersion: item.updated_at };
      if (!contentReviewSchema.safeParse(body).success) return { error: 'a note of at least 10 characters is required unless approving' };
      return {
        details: [
          { field: 'item', value: `${item.name} (${args.type})` },
          { field: 'decision', value: args.decision },
          ...(args.note ? [{ field: 'note', value: args.note }] : []),
        ],
        request: { method: 'POST', url: '/api/admin/catalogue/reviews', body },
        link: '/admin/catalogue',
      };
    },
  },
  resolve_chat_report: {
    description: 'Close an open chat report. Args: {"id": report id from list_records open_chat_reports, "outcome": "resolved"|"dismissed", "reason": "action_taken"|"no_violation"|"insufficient_evidence"|"spam_abuse", "note"?: string}. Only propose the outcome and reason the admin stated; you cannot read the chat.',
    args: z.object({
      id: uuid,
      outcome: z.enum(['resolved', 'dismissed']),
      reason: z.enum(['action_taken', 'no_violation', 'insufficient_evidence', 'spam_abuse']),
      note: z.string().trim().max(1000).optional(),
    }).strict(),
    async build(service, args: { id: string; outcome: string; reason: string; note?: string }) {
      const report = await exists(service, 'chat_reports', 'id', args.id, 'id, reason, status');
      if (!report || report.status !== 'open') return { error: 'open report not found' };
      return {
        details: [
          { field: 'report', value: String(report.reason) },
          { field: 'outcome', value: args.outcome },
          { field: 'reason', value: args.reason },
          ...(args.note ? [{ field: 'note', value: args.note }] : []),
        ],
        request: { method: 'PATCH', url: `/api/admin/chat-reports/${args.id}`, body: { status: args.outcome, resolution_reason: args.reason, ...(args.note ? { resolution_note: args.note } : {}) } },
        link: '/admin/chat-reports',
      };
    },
  },
  set_event_ad_paused: {
    description: 'Pause a running event ad or resume a paused one. Args: {"id": ad id from list_records event_ads, "paused": boolean}.',
    args: z.object({ id: uuid, paused: z.boolean() }).strict(),
    async build(service, args: { id: string; paused: boolean }) {
      const ad = await exists(service, 'vendor_event_promotions', 'id', args.id, 'id, title, status');
      if (!ad || ad.status !== (args.paused ? 'paid' : 'paused')) return { error: args.paused ? 'running ad not found' : 'paused ad not found' };
      return {
        details: [{ field: 'ad', value: String(ad.title) }, { field: 'change', value: args.paused ? 'pause' : 'resume' }],
        request: { method: 'PATCH', url: `/api/admin/event-promotions/${args.id}`, body: { action: args.paused ? 'pause' : 'resume' } },
        link: '/admin/event-promotions',
      };
    },
  },
  pause_sponsored_ad: {
    description: 'Pause an active sponsored placement. Args: {"id": placement id from list_records sponsored_ads}. Resuming needs a fresh impact preview, so it is done on the Sponsored Ads page.',
    args: z.object({ id: uuid }).strict(),
    async build(service, args: { id: string }) {
      const placement = await exists(service, 'sponsored_discovery_placements', 'id', args.id, 'id, status, products(name)');
      if (!placement || placement.status !== 'active') return { error: 'active placement not found' };
      return {
        details: [{ field: 'ad', value: relatedName(placement.products) ?? args.id }, { field: 'change', value: 'pause' }],
        request: { method: 'PATCH', url: `/api/admin/sponsored-placements/${args.id}`, body: { action: 'pause' } },
        link: '/admin/sponsored-placements',
      };
    },
  },
  change_stall_number: {
    description: 'Change the booth number of an approved event stall. Args: {"id": stall id from list_records event_stalls, "stallNumber": new booth, "reason"?: 5 to 500 characters}.',
    args: z.object({ id: uuid, stallNumber: z.string().trim().min(1).max(40), reason: z.string().trim().min(5).max(500).optional() }).strict(),
    async build(service, args: { id: string; stallNumber: string; reason?: string }) {
      const stall = await exists(service, 'promotion_campaign_vendors', 'id', args.id, 'id, status, stall_number, updated_at, vendors(name)');
      if (!stall || stall.status !== 'approved') return { error: 'approved stall not found' };
      return {
        details: [
          { field: 'vendor', value: relatedName(stall.vendors) ?? '' },
          { field: 'stallNumber', value: `${stall.stall_number ?? '-'} to ${args.stallNumber}` },
          ...(args.reason ? [{ field: 'reason', value: args.reason }] : []),
        ],
        request: {
          method: 'PATCH',
          url: `/api/admin/event-registrations/${args.id}/stall`,
          body: { stallNumber: args.stallNumber, expectedUpdatedAt: stall.updated_at, ...(args.reason ? { reason: args.reason } : {}) },
        },
        link: '/admin/event-registrations',
      };
    },
  },
} satisfies Record<string, Spec>;

export type ActionName = keyof typeof ACTION_SPECS;
export const ACTION_NAMES = Object.keys(ACTION_SPECS) as ActionName[];

export function actionRegistryDescription(): string {
  return ACTION_NAMES.map((name) => `- ${name}: ${ACTION_SPECS[name].description}`).join('\n');
}

/** propose_action: validate, check the target, and build the confirm card. Never writes. */
export async function proposeAction(service: SupabaseClient, name: string, argsJson: string): Promise<ProposedAction | { error: string; expected?: string }> {
  if (!(ACTION_NAMES as string[]).includes(name)) return { error: 'unknown_action' };
  const spec: Spec = ACTION_SPECS[name as ActionName];
  let raw: unknown;
  try {
    raw = JSON.parse(argsJson || '{}');
  } catch {
    return { error: 'args_json is not valid JSON', expected: spec.description };
  }
  const args = spec.args.safeParse(raw);
  if (!args.success) return { error: 'invalid_args', expected: spec.description };
  const built = await spec.build(service, args.data as never);
  if ('error' in built) return built;
  return { id: crypto.randomUUID(), action: name as ActionName, ...built };
}

/** On/off lists the admin can switch in a table instead of one card per item. */
const CHOICE_SPECS = {
  kb_entries: { action: 'set_kb_entry_active', list: 'entries', key: 'id', label: 'title', request: (key: string) => ({ url: `/api/admin/chatbot/kb/${key}`, body: {} }) },
  hotel_amenities: { action: 'set_hotel_amenity_active', list: 'amenities', key: 'code', label: 'label', request: (key: string) => ({ url: '/api/admin/hotel-amenities', body: { code: key } }) },
  moderation_words: { action: 'set_moderation_word_active', list: 'words', key: 'id', label: 'term', request: (key: string) => ({ url: `/api/admin/moderation-words/${key}`, body: {} }) },
} as const;

export const CHOICE_KINDS = Object.keys(CHOICE_SPECS) as (keyof typeof CHOICE_SPECS)[];

export interface ChoiceRow {
  key: string;
  label: string;
  active: boolean;
  /** PATCH for the existing route; the table adds `isActive` when the admin saves. */
  request: { method: 'PATCH'; url: string; body: Record<string, unknown> };
}

export interface ChoiceList {
  /** Random per table, for React keys. */
  id: string;
  action: ActionName;
  rows: ChoiceRow[];
}

/** show_choices: the same filtered list as list_records, as switch rows. Never writes. */
export async function buildChoiceList(service: SupabaseClient, kind: string, active?: boolean): Promise<ChoiceList | { error: string }> {
  if (!(CHOICE_KINDS as string[]).includes(kind)) return { error: 'unknown kind' };
  const spec = CHOICE_SPECS[kind as keyof typeof CHOICE_SPECS];
  const listed = await listRecords(service, kind, undefined, active);
  const items = (listed[spec.list] ?? []) as Record<string, unknown>[];
  return {
    id: crypto.randomUUID(),
    action: spec.action,
    rows: items.map((item) => {
      const key = String(item[spec.key]);
      return { key, label: String(item[spec.label] ?? key), active: Boolean(item.active), request: { method: 'PATCH', ...spec.request(key) } };
    }),
  };
}
