// P4 — Member 4: AI-drafted vendor approval (welcome) emails. Same
// provider/key/model/timeout convention as lib/recommendations/invite-draft.ts
// (Gemini, process.env.LLM_API_KEY, gemini-flash-lite-latest) — a different
// system prompt/framing, so it's its own module.
//
// Advisory only, by construction: this returns a draft. Nothing in this
// file writes to any table or sends any email — that happens through
// app/api/admin/vendors/[id]/approval-email/route.ts's Send action, only
// once the admin has reviewed/edited the draft in the admin UI's modal.
//
// Unlike the recommendation-invite flow, this vendor is ALREADY approved —
// there is no sign-up/claim-token concept here, just a congratulatory
// message pointing them to their existing dashboard. The draft still never
// includes a URL (the real dashboard link is appended server-side at send
// time), for the same reason: nothing should depend on the model getting a
// link right.

import { redactPII } from '@/lib/chatbot/pii';

const DRAFT_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-lite-latest:generateContent';
const DRAFT_TIMEOUT_MS = 15_000;

// Same address already used on order receipts (lib/pdf/receipt.ts,
// lib/email/order-receipt.ts) — a real, known fact, not something the model
// should placeholder.
const SUPPORT_EMAIL = 'mywisatamalaysia@gmail.com';

const SYSTEM_PROMPT = `You are drafting a warm, congratulatory email for MyWisata, a Malaysian
tourism booking platform, welcoming a vendor whose application has just
been APPROVED.

This business already applied and was reviewed — they do NOT need to sign
up or register anything. Do not use "invite" or "sign up" language. Simply
congratulate them and let them know they can now log into their vendor
dashboard to set up outlets and product listings.

Rules — these are strict:
- Only state facts you can reasonably infer are generally true for a
  tourism booking platform (e.g. "you can now add outlets and listings" is
  a reasonable inference; a specific commission rate, payout schedule, or
  onboarding-call time is NOT — you cannot know that).
- If the vendor needs a way to ask questions, the real support email is
  ${SUPPORT_EMAIL} — use it directly. Never write a placeholder for the
  support/contact email.
- Wherever a specific figure, deadline, or policy detail is needed and you
  do not actually know it from the context given, write a placeholder in
  EXACTLY this form: [ADMIN: confirm <what's needed>]. Never invent a
  specific number, deadline, percentage, or policy detail.
- Do NOT include any URL, link, or link placeholder anywhere in the body —
  a real dashboard link will be appended automatically by the system after
  your text. You may reference it in prose (e.g. "Log in using the link
  below to get started"), but never write the link itself.
- Address the business by their contact name if one is given, otherwise by
  their business name.
- Be concise: 3-6 short sentences.
- Respond in EXACTLY this format and nothing else, no markdown fences, no
  extra commentary:
SUBJECT: <a short, warm subject line>
BODY: <the email body>`;

export interface VendorApprovalDraft {
  subject: string;
  body: string;
}

export interface VendorApprovalDraftContext {
  vendorName: string;
  businessType: string | null;
  description: string | null;
  contactName: string | null;
  address: string | null;
}

/**
 * Drafts a subject + body for a vendor approval/welcome email. Never
 * throws: returns null on any failure (missing key, network, timeout,
 * malformed/unparseable response) so the caller can show "couldn't draft
 * one" instead of a 500 — this is a nice-to-have admin tool, not a money or
 * accuracy path.
 */
export async function draftVendorApprovalEmail(context: VendorApprovalDraftContext): Promise<VendorApprovalDraft | null> {
  const apiKey = process.env.LLM_API_KEY;
  if (!apiKey) return null;

  // Same redaction boundary as invite-draft.ts/kb-draft.ts — the vendor's
  // free-text description may contain PII; nothing goes to Gemini unredacted.
  const { clean: cleanDescription } = redactPII(context.description ?? '');

  const userText = [
    `BUSINESS NAME: ${context.vendorName}`,
    context.businessType ? `BUSINESS TYPE: ${context.businessType}` : null,
    context.address ? `LOCATION: ${context.address}` : null,
    context.contactName ? `CONTACT NAME: ${context.contactName}` : null,
    cleanDescription ? `DESCRIPTION: ${cleanDescription}` : null,
  ]
    .filter(Boolean)
    .join('\n');

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), DRAFT_TIMEOUT_MS);

  try {
    const res = await fetch(DRAFT_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
        contents: [{ role: 'user', parts: [{ text: userText }] }],
        generationConfig: { temperature: 0.3, maxOutputTokens: 400 },
      }),
      signal: controller.signal,
    });
    if (!res.ok) return null;

    const body = (await res.json()) as { candidates?: { content?: { parts?: { text?: string }[] } }[] };
    const text = body.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
    if (!text) return null;

    return parseDraft(text);
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Parses the strict "SUBJECT: ...\nBODY: ..." format the system prompt
 * requires. BODY may span multiple lines (everything after the BODY:
 * marker), SUBJECT is always the first line. Returns null if the model
 * didn't follow the format — treated as a draft failure by the caller,
 * never a half-parsed guess passed through as if it were reliable.
 */
function parseDraft(text: string): VendorApprovalDraft | null {
  const subjectMatch = /^SUBJECT:\s*(.+)$/m.exec(text);
  const bodyMatch = /^BODY:\s*([\s\S]+)$/m.exec(text);
  const subject = subjectMatch?.[1]?.trim();
  const body = bodyMatch?.[1]?.trim();
  if (!subject || !body) return null;
  return { subject, body };
}
