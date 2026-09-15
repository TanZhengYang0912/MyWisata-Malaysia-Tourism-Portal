// P4 — Member 4: AI-drafted vendor recommendation invite emails.
// Same provider/key/model/timeout convention as lib/chatbot/kb-draft.ts
// (Gemini, process.env.LLM_API_KEY, gemini-flash-lite-latest) — a different
// system prompt/output shape (an invite subject+body, not a KB entry), so
// it's its own module rather than a mode of the KB drafter.
//
// Advisory only, by construction: this returns a draft. Nothing in this
// file writes to any table or sends any email — that happens through
// app/api/admin/vendors/recommendation-invite/route.ts's existing Send
// action, only once the admin has reviewed/edited the draft in the admin
// UI's modal.
//
// The draft deliberately never includes a claim URL — the invite token
// (and therefore the real link) is only created at Send time, so the
// system prompt instructs the model to write persuasive body text that may
// reference "the sign-up link included below" without ever writing a URL
// itself. The server appends the real link after the admin's edited text.

import { redactPII } from '@/lib/chatbot/pii';

const DRAFT_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-lite-latest:generateContent';
const DRAFT_TIMEOUT_MS = 15_000;

// Same address already used on order receipts (lib/pdf/receipt.ts,
// lib/email/order-receipt.ts) — a real, known fact, not something the model
// should placeholder.
const SUPPORT_EMAIL = 'support@mylawatan.my';

const SYSTEM_PROMPT = `You are drafting a short outreach email for MyLawatan, a Malaysian tourism
booking platform, inviting a locally-recommended business to join as a
vendor.

A MyLawatan customer recommended this business as worth having on the
platform, and an admin has approved the recommendation. Draft a warm,
professional invitation inviting the business to complete vendor sign-up.

Rules — these are strict:
- Only state facts you can reasonably infer are generally true for a
  tourism booking platform (e.g. "join a growing platform of Malaysian
  travel experiences" is a reasonable inference; a specific commission
  rate, fee, or signup deadline is NOT — you cannot know that).
- If the business needs a way to ask questions, the real support email is
  ${SUPPORT_EMAIL} — use it directly. Never write a placeholder for the
  support/contact email.
- Wherever a specific figure, fee, deadline, or policy detail is needed and
  you do not actually know it from the context given, write a placeholder
  in EXACTLY this form: [ADMIN: confirm <what's needed>]. Never invent a
  specific number, deadline, percentage, or policy detail.
- Do NOT include any URL, link, or link placeholder anywhere in the body —
  a real sign-up link will be appended automatically by the system after
  your text. You may reference it in prose (e.g. "Use the sign-up link
  included below to get started"), but never write the link itself.
- Be concise: 3-6 short sentences.
- Respond in EXACTLY this format and nothing else, no markdown fences, no
  extra commentary:
SUBJECT: <a short, warm subject line>
BODY: <the email body>`;

export interface VendorInviteDraft {
  subject: string;
  body: string;
}

export interface VendorInviteDraftContext {
  vendorName: string;
  description: string | null;
  vendorAddress: string | null;
  category: string | null;
}

/**
 * Drafts a subject + body for a vendor recommendation invite email. Never
 * throws: returns null on any failure (missing key, network, timeout,
 * malformed/unparseable response) so the caller can show "couldn't draft
 * one" instead of a 500 — this is a nice-to-have admin tool, not a money or
 * accuracy path.
 */
export async function draftVendorInviteEmail(context: VendorInviteDraftContext): Promise<VendorInviteDraft | null> {
  const apiKey = process.env.LLM_API_KEY;
  if (!apiKey) return null;

  // Same redaction boundary as kb-draft.ts/generate.ts — the recommendation's
  // free-text description may contain PII the recommender typed in; nothing
  // user-typed reaches Gemini unredacted.
  const { clean: cleanDescription } = redactPII(context.description ?? '');

  const userText = [
    `BUSINESS NAME: ${context.vendorName}`,
    context.category ? `CATEGORY: ${context.category}` : null,
    context.vendorAddress ? `LOCATION: ${context.vendorAddress}` : null,
    cleanDescription ? `DESCRIPTION (from the customer who recommended this business): ${cleanDescription}` : null,
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
function parseDraft(text: string): VendorInviteDraft | null {
  const subjectMatch = /^SUBJECT:\s*(.+)$/m.exec(text);
  const bodyMatch = /^BODY:\s*([\s\S]+)$/m.exec(text);
  const subject = subjectMatch?.[1]?.trim();
  const body = bodyMatch?.[1]?.trim();
  if (!subject || !body) return null;
  return { subject, body };
}
