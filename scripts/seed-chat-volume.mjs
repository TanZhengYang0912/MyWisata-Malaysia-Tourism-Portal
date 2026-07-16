#!/usr/bin/env node
/**
 * Idempotent volume seed for the chat feature — ~30 conversations, ~30 reports,
 * ~30 admin report-bans, so the inbox/report lists have realistic scale to test
 * against (search, filters, pagination, reputation badges, ban history).
 *
 * Mock chat participants are public.users rows only (no auth.users / login
 * needed — they never sign in, they're just "other people" the demo accounts
 * see in threads/reports). Emails use @chatseed.local, NOT @demo.local, so
 * they don't pollute the /login demo-account picker (which lists %@demo.local).
 *
 * Run with: CHAT_VOLUME_SEED=1 node scripts/seed-chat-volume.mjs
 *
 * Teardown (if you want to remove everything this script created):
 *   delete from chat_report_bans where reason like 'chatvol:%';
 *   delete from chat_reports where id::text like 'c9%';
 *   delete from chat_messages where thread_id in (select id from chat_threads where id::text like 'c9%');
 *   delete from chat_threads where id::text like 'c9%';
 *   delete from users where email like '%@chatseed.local';
 * (all ids below are content-derived stableUuid()s under the "chatvol:" namespace,
 * and happen to start with c9 due to the hash — verify with the SELECTs this
 * script prints before deleting anything.)
 */

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { createClient } from '@supabase/supabase-js';

function loadEnv() {
  for (const filename of ['.env.local', '.env']) {
    const filepath = path.resolve(process.cwd(), filename);
    if (!fs.existsSync(filepath)) continue;
    for (const line of fs.readFileSync(filepath, 'utf8').split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const match = trimmed.match(/^([A-Z_][A-Z0-9_]*)\s*=\s*(.*)$/);
      if (match && !process.env[match[1]]) {
        process.env[match[1]] = match[2].replace(/^['"]|['"]$/g, '');
      }
    }
    break;
  }
}

loadEnv();

if (process.env.CHAT_VOLUME_SEED !== '1') {
  console.error('Refusing to seed without CHAT_VOLUME_SEED=1.');
  process.exit(1);
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
if (!url || !serviceKey) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY/SUPABASE_SERVICE_KEY.');
  process.exit(1);
}

const supabase = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });

function stableUuid(value) {
  const hex = crypto.createHash('md5').update(`malaysia-tourism-demo:${value}`).digest('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20)}`;
}

function chunk(values, size = 200) {
  const output = [];
  for (let i = 0; i < values.length; i += size) output.push(values.slice(i, i + size));
  return output;
}

async function upsert(table, rows, onConflict = 'id') {
  for (const batch of chunk(rows)) {
    const { error } = await supabase.from(table).upsert(batch, { onConflict });
    if (error) throw new Error(`${table} (onConflict=${onConflict}): ${error.message}`);
  }
}

async function insertIgnoreDuplicates(table, rows) {
  for (const batch of chunk(rows)) {
    const { error } = await supabase.from(table).upsert(batch, { onConflict: 'id', ignoreDuplicates: true });
    if (error) throw new Error(`${table}: ${error.message}`);
  }
}

// ─── Fixed demo accounts (see scripts/seed-remote-demo.mjs) ────────────────
const ADMIN_ID = 'aaaaaaaa-0000-0000-0000-000000000001';
const DEMO_CUSTOMER_IDS = [
  'aaaaaaaa-0000-0000-0000-000000000005', // Alice
  'aaaaaaaa-0000-0000-0000-000000000006', // Bob
  'aaaaaaaa-0000-0000-0000-000000000007', // Carol
  'aaaaaaaa-0000-0000-0000-000000000008', // Dave
];

const MOCK_NAMES = [
  'Nurul Izzati', 'Wei Jian', 'Kavitha Selvam', 'Amirul Hakim', 'Suet Ling',
  'Farah Diyana', 'Jason Tan', 'Priya Ramasamy', 'Haziq Rahman', 'Michelle Wong',
  'Aiman Zulkifli', 'Devi Ganesan', 'Choon Hong', 'Siti Aishah', 'Ryan Lim',
  'Nabila Yusof', 'Vignesh Kumar', 'Faridah Omar', 'Kenneth Chia', 'Aina Sofea',
  'Zulhilmi Azman', 'Grace Anak Jimbai', 'Muthu Krishnan', 'Yasmin Abdullah', 'Bryan Ho',
  'Halimah Tuha',
];

const MOCK_CUSTOMERS = MOCK_NAMES.map((name, index) => ({
  id: stableUuid(`chatvol:customer:${index}`),
  email: `chatseed+${String(index + 1).padStart(2, '0')}@chatseed.local`,
  name,
}));

const ALL_CUSTOMER_IDS = [...DEMO_CUSTOMER_IDS, ...MOCK_CUSTOMERS.map((c) => c.id)]; // 30 total

// ─── Conversation archetypes — cycled across threads with per-thread variation ──
function archetype(id, lines) {
  return { id, lines }; // lines: [{ role: 'customer'|'vendor', text, replyToIndex? }]
}

const ARCHETYPES = [
  archetype('booking-inquiry', [
    { role: 'vendor', text: 'Welcome! Thanks for your interest. Any questions?' },
    { role: 'customer', text: 'Hi, do you have availability for a group of 4 this weekend?' },
    { role: 'vendor', text: 'Yes we do! Saturday or Sunday?' },
    { role: 'customer', text: 'Saturday afternoon would be perfect.' },
    { role: 'vendor', text: 'Great, 2pm works well. Any dietary needs?' },
    { role: 'customer', text: 'One of us is vegetarian, that’s it.' },
    { role: 'vendor', text: 'Noted, we’ll have options ready.' },
    { role: 'customer', text: 'Thank you so much, booking now!' },
  ]),
  archetype('price-question', [
    { role: 'customer', text: 'Hi, how much is it per person for the full experience?' },
    { role: 'vendor', text: 'It’s RM 65 per adult and RM 35 per child under 12.' },
    { role: 'customer', text: 'Does that include transport?' },
    { role: 'vendor', text: 'Transport within the city centre is included, yes.' },
    { role: 'customer', text: 'Sounds good, thanks for clarifying!' },
  ]),
  archetype('allergy-check', [
    { role: 'customer', text: 'Before booking — do you handle severe nut allergies safely?' },
    { role: 'vendor', text: 'Yes, we have a dedicated nut-free prep area for guests who flag it.' },
    { role: 'customer', text: 'That’s reassuring. I’ll flag it when I book.', replyToIndex: 1 },
    { role: 'vendor', text: 'Perfect, just mention it in the booking notes and we’ll confirm.' },
  ]),
  archetype('complaint-resolved', [
    { role: 'vendor', text: 'Welcome! Thanks for your interest. Any questions?' },
    { role: 'customer', text: 'We waited 30 minutes past our reservation time yesterday, not great.' },
    { role: 'vendor', text: 'I’m really sorry to hear that. Can you share your booking reference?' },
    { role: 'customer', text: 'BK-77104.' },
    { role: 'vendor', text: 'Found it — there was a staffing gap that evening, that’s on us. We’d like to offer a discount on your next visit.' },
    { role: 'customer', text: 'I appreciate that, thank you for owning it.', replyToIndex: 4 },
    { role: 'vendor', text: 'Of course — look forward to hosting you again.' },
  ]),
  archetype('cancellation', [
    { role: 'customer', text: 'Hi, I need to cancel my booking for next week, is that possible?' },
    { role: 'vendor', text: 'No problem, cancellations 48h ahead are fully refundable.' },
    { role: 'customer', text: 'Great, it’s more than 48h away.' },
    { role: 'vendor', text: 'All set, refund will show in 3-5 business days.' },
  ]),
  archetype('unanswered-question', [
    { role: 'customer', text: 'Hello! Just checking your opening hours on public holidays?' },
    { role: 'customer', text: 'Hi, following up on this — anyone around?' },
  ]),
  archetype('masked-contact-attempt', [
    { role: 'vendor', text: 'Welcome! Thanks for your interest. Any questions?' },
    { role: 'customer', text: 'Can we talk outside the app? Call me at •••••• or add my ig ••••••' },
    { role: 'vendor', text: 'We keep all booking chat on the app for your safety, happy to help here!' },
    { role: 'customer', text: 'Fair enough, what’s your cancellation policy?', replyToIndex: 2 },
    { role: 'vendor', text: 'Free cancellation up to 48h before your slot.' },
  ]),
  archetype('spammy-vendor', [
    { role: 'vendor', text: 'Welcome! Thanks for your interest. Any questions?' },
    { role: 'customer', text: 'Just checking your opening hours.' },
    { role: 'vendor', text: 'We’re open daily! BIG SALE THIS WEEK — 40% off everything!' },
    { role: 'vendor', text: 'Don’t miss out, limited slots, book NOW!' },
    { role: 'customer', text: 'I only wanted the hours, please stop with the promos.' },
    { role: 'vendor', text: 'Sure! Also check our loyalty program for a free gift!' },
  ]),
  archetype('group-booking', [
    { role: 'customer', text: 'We’re a group of 12 for a company outing, can you accommodate that?' },
    { role: 'vendor', text: 'Yes! Groups of 10+ get a private area and a set menu option.' },
    { role: 'customer', text: 'That sounds ideal. What’s the group rate?' },
    { role: 'vendor', text: 'RM 55 per person for groups above 10, minimum 2 weeks notice.' },
    { role: 'customer', text: 'We have 3 weeks, I’ll get approval and confirm.', replyToIndex: 3 },
  ]),
  archetype('positive-feedback', [
    { role: 'customer', text: 'Just wanted to say we had a wonderful time yesterday, thank you!' },
    { role: 'vendor', text: 'That means so much to us, thank you for letting us know!' },
    { role: 'customer', text: 'Definitely coming back with more friends.' },
    { role: 'vendor', text: 'We’ll be here — see you soon!' },
  ]),
];

// ─── Report + ban content pools ─────────────────────────────────────────────
const REPORT_REASONS = ['scam', 'abuse', 'spam', 'other'];
const RESOLUTION_REASONS = ['action_taken', 'no_violation', 'insufficient_evidence', 'spam_abuse'];
const RESOLUTION_NOTES = {
  action_taken: 'Vendor warned about the reported behaviour; repeat violations will escalate.',
  no_violation: 'Reviewed the conversation — no policy violation found.',
  insufficient_evidence: 'No clear evidence of the reported issue in the conversation history.',
  spam_abuse: 'Confirmed promotional spam pattern; vendor account flagged internally.',
};
const BAN_REASONS = [
  'Repeated bad-faith reports against multiple vendors.',
  'Abusive language toward vendor staff in chat.',
  'Attempted to move transactions off-platform after warning.',
  'Spam messaging across several outlet threads.',
  'Harassment reported by more than one vendor.',
];

function daysAgo(n) { return new Date(Date.now() - n * 24 * 60 * 60 * 1000); }
function minutesAfter(date, n) { return new Date(date.getTime() + n * 60 * 1000); }

async function main() {
  console.log('--- 1/5 Seeding mock chat participants (public.users only, no auth) ---');
  // Deliberately omit email_verified_at/kyc_status/tier — a `protect_verification_fields`
  // trigger rejects UPDATEs that change those columns, so leaving them out of the payload
  // keeps re-runs idempotent (upsert only SETs columns present in the row object).
  await upsert('users', MOCK_CUSTOMERS.map((c) => ({
    id: c.id,
    email: c.email,
    full_name: c.name,
  })));
  console.log(`  upserted ${MOCK_CUSTOMERS.length} mock customers`);

  console.log('--- 2/5 Loading vendor + outlet registry ---');
  const { data: vendors, error: vendorsError } = await supabase.from('vendors').select('id, owner_id, name');
  if (vendorsError) throw vendorsError;
  const ownerByVendor = new Map(vendors.map((v) => [v.id, v.owner_id]));

  const { data: outlets, error: outletsError } = await supabase.from('outlets').select('id, vendor_id, name').order('created_at');
  if (outletsError) throw outletsError;
  if (outlets.length === 0) throw new Error('No outlets found — run seed:remote-demo first.');
  console.log(`  ${vendors.length} vendors, ${outlets.length} outlets available`);

  console.log('--- 3/5 Building 30 threads + messages ---');
  const threads = [];
  const messages = [];
  const threadMeta = []; // { threadId, customerId, outletId, vendorOwnerId }

  for (let i = 0; i < ALL_CUSTOMER_IDS.length; i++) {
    const customerId = ALL_CUSTOMER_IDS[i];
    const outlet = outlets[i % outlets.length];
    const senderForRole = { vendor: ownerByVendor.get(outlet.vendor_id), customer: customerId };
    const archetypeDef = ARCHETYPES[i % ARCHETYPES.length];

    const threadId = stableUuid(`chatvol:thread:${i}`);
    const startedAt = daysAgo(30 - i); // spread across the last ~30 days
    const messageIds = archetypeDef.lines.map((_, lineIndex) => stableUuid(`chatvol:msg:${i}:${lineIndex}`));

    let lastCreatedAt = startedAt;
    archetypeDef.lines.forEach((line, lineIndex) => {
      lastCreatedAt = lineIndex === 0 ? startedAt : minutesAfter(lastCreatedAt, 3 + (lineIndex % 5));
      messages.push({
        id: messageIds[lineIndex],
        thread_id: threadId,
        sender_id: senderForRole[line.role],
        body: line.text,
        created_at: lastCreatedAt.toISOString(),
        reply_to_message_id: line.replyToIndex !== undefined ? messageIds[line.replyToIndex] : null,
      });
    });

    threads.push({
      id: threadId,
      customer_id: customerId,
      outlet_id: outlet.id,
      status: 'open',
      created_at: startedAt.toISOString(),
      last_message_at: lastCreatedAt.toISOString(),
    });
    threadMeta.push({ threadId, customerId, outletId: outlet.id, vendorOwnerId: senderForRole.vendor });
  }

  // IMPORTANT: this project has no generic exec_sql RPC (see scripts/apply-migration.mjs),
  // so the chat_threads_welcome trigger cannot be disabled from this script itself.
  // Disable it manually (via MCP execute_sql or the SQL editor) BEFORE running this
  // script, and re-enable it after — mirrors scripts/seed-chat-demo.sql:
  //   alter table chat_threads disable trigger chat_threads_welcome;   -- before
  //   alter table chat_threads enable trigger chat_threads_welcome;    -- after
  await insertIgnoreDuplicates('chat_threads', threads);
  await insertIgnoreDuplicates('chat_messages', messages);
  console.log(`  ${threads.length} threads, ${messages.length} messages upserted`);

  console.log('--- 4/5 Seeding ~30 reports ---');
  const reports = [];
  let reportIndex = 0;
  // Give the FIRST mock customer 4 reports (3 dismissed) across 4 distinct
  // threads to trigger the "serial false-reporter" reputation throttle.
  const repeatReporterId = MOCK_CUSTOMERS[0].id;
  const repeatReporterThreads = threadMeta.filter((t) => t.customerId !== repeatReporterId).slice(0, 4);
  repeatReporterThreads.forEach((t, idx) => {
    const status = idx < 3 ? 'dismissed' : 'open';
    const resolutionReason = status === 'dismissed' ? RESOLUTION_REASONS[idx % 2 === 0 ? 1 : 2] : null; // no_violation / insufficient_evidence
    reports.push({
      id: stableUuid(`chatvol:report:${reportIndex++}`),
      thread_id: t.threadId,
      reporter_id: repeatReporterId,
      reason: REPORT_REASONS[idx % REPORT_REASONS.length],
      details: 'Reported via seeded reputation scenario.',
      status,
      resolution_reason: resolutionReason,
      resolution_note: resolutionReason ? RESOLUTION_NOTES[resolutionReason] : null,
      resolved_by: status === 'dismissed' ? ADMIN_ID : null,
      resolved_at: status === 'dismissed' ? daysAgo(idx + 1).toISOString() : null,
      created_at: daysAgo(idx + 2).toISOString(),
    });
  });

  // Remaining reports spread across other threads, one reporter per thread
  // (respects the one-open-report-per-reporter-per-thread unique index).
  const remainingThreads = threadMeta.filter((t) => !repeatReporterThreads.includes(t));
  for (let i = 0; reports.length < 30 && i < remainingThreads.length; i++) {
    const t = remainingThreads[i];
    const status = ['open', 'open', 'resolved', 'dismissed'][i % 4];
    const resolutionReason = status !== 'open' ? RESOLUTION_REASONS[i % RESOLUTION_REASONS.length] : null;
    // Alternate the reporter between the customer and the vendor owner on that
    // thread — a few threads get a second report from the other side (crowd signal).
    const reporterId = i % 5 === 0 ? t.vendorOwnerId : t.customerId;
    reports.push({
      id: stableUuid(`chatvol:report:${reportIndex++}`),
      thread_id: t.threadId,
      reporter_id: reporterId,
      reason: REPORT_REASONS[i % REPORT_REASONS.length],
      details: 'Seeded report for volume testing.',
      status,
      resolution_reason: resolutionReason,
      resolution_note: resolutionReason ? RESOLUTION_NOTES[resolutionReason] : null,
      resolved_by: status !== 'open' ? ADMIN_ID : null,
      resolved_at: status !== 'open' ? daysAgo(i % 10).toISOString() : null,
      created_at: daysAgo(i % 15 + 1).toISOString(),
    });
  }

  await insertIgnoreDuplicates('chat_reports', reports);
  console.log(`  ${reports.length} reports upserted`);

  console.log('--- 5/5 Seeding ~30 report-bans ---');
  const bans = [];
  for (let i = 0; i < 30; i++) {
    const userId = MOCK_CUSTOMERS[i % MOCK_CUSTOMERS.length].id;
    const active = i % 3 !== 0; // ~20 active, ~10 expired
    const bannedUntil = active ? new Date(Date.now() + (i % 7 + 1) * 24 * 60 * 60 * 1000) : daysAgo(i % 10 + 1);
    bans.push({
      id: stableUuid(`chatvol:ban:${i}`),
      user_id: userId,
      banned_until: bannedUntil.toISOString(),
      reason: BAN_REASONS[i % BAN_REASONS.length],
      banned_by: ADMIN_ID,
      created_at: daysAgo(i % 20 + 2).toISOString(),
    });
  }
  await insertIgnoreDuplicates('chat_report_bans', bans);
  console.log(`  ${bans.length} report-bans upserted`);

  console.log('\nDone. Re-run anytime — all rows use stable, content-derived ids.');
}

main().catch((error) => {
  console.error('Seed failed:', error);
  process.exit(1);
});
