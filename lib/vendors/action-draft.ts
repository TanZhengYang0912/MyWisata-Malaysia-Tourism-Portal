// P4 — Member 4: AI-drafted reason text for the three vendor actions that
// take a free-text reason — reject, suspend, request_information — mirroring
// lib/vendors/approval-draft.ts's shape (same provider/key/model/timeout
// convention) but for the single `reason` field these actions already have,
// instead of a subject+body email.
//
// That `reason` is not cosmetic: app/api/admin/vendors/[id]/{approve,suspend}
// routes pass it straight into the in-app notification body AND (via
// emitVendorNotification -> enqueueVendorEmail -> lib/email/templates.ts) the
// "Reason: ..." line of the real email the vendor receives. So drafting it
// well is drafting the admin's actual rejection notice / suspension warning /
// follow-up request — this IS "AI drafts the message, admin edits, admin
// sends", same rule as approval-draft.ts.
//
// Advisory only, by construction: this returns a draft string. Nothing here
// writes to any table, changes vendor status, or sends anything — that only
// happens once the admin confirms the (possibly hand-edited) reason in the
// admin UI and the existing approve/suspend routes run.

import { redactPII } from '@/lib/chatbot/pii';

const DRAFT_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-lite-latest:generateContent';
const DRAFT_TIMEOUT_MS = 15_000;
const SUPPORT_EMAIL = 'support@mylawatan.my';

export type VendorReasonAction = 'reject' | 'suspend' | 'request_information';

const ACTION_FRAMING: Record<VendorReasonAction, string> = {
  reject: `This vendor's application is being REJECTED. Draft the REASON text the admin will send —
it becomes the body of the rejection notice. Be professional and not harsh; if it's reasonable for
this business to reapply after addressing the gap, say so.`,
  suspend: `This vendor's account is being SUSPENDED. Draft the REASON text the admin will send — it
becomes the body of the suspension warning notice. State plainly that the account is suspended,
that listings are no longer visible to travellers, and how to get reinstated (contact support).`,
  request_information: `The admin needs MORE INFORMATION from this vendor before their application can
proceed. Draft the REASON text the admin will send — it becomes the body of a follow-up request
asking them to provide what's missing.`,
};

const SYSTEM_PROMPT_PREFIX = `You are drafting a short administrative message for MyLawatan, a Malaysian
tourism booking platform, about a vendor account.

Rules — these are strict:
- Only state facts you can reasonably infer are generally true for a tourism booking platform.
  Never invent a specific policy detail, deadline, or document requirement you don't actually know.
- Wherever a specific figure, deadline, or missing-document detail is needed and you do not know it
  from the context given, write a placeholder in EXACTLY this form: [ADMIN: confirm <what's needed>].
- If the vendor needs a way to ask questions, the real support email is ${SUPPORT_EMAIL} — use it
  directly. Never write a placeholder for the support/contact email.
- Do NOT include any URL or link.
- Address the business by their contact name if one is given, otherwise by their business name.
- Be concise: 2-4 short sentences. This is a REASON field, not a full email — no greeting, no
  sign-off, just the message itself.
- Respond with ONLY the reason text and nothing else — no markdown, no quotes, no "REASON:" prefix.`;

export interface VendorActionDraftContext {
  vendorName: string;
  businessType: string | null;
  description: string | null;
  contactName: string | null;
}

/**
 * Drafts the `reason` text for one of the three vendor actions above. Never
 * throws: returns null on any failure (missing key, network, timeout, empty
 * response) so the caller shows "couldn't draft one" and the admin can still
 * type a reason by hand — this is a nice-to-have, not a blocking dependency
 * of the action it feeds.
 */
export async function draftVendorActionReason(action: VendorReasonAction, context: VendorActionDraftContext): Promise<string | null> {
  const apiKey = process.env.LLM_API_KEY;
  if (!apiKey) return null;

  // Same redaction boundary as approval-draft.ts/invite-draft.ts.
  const { clean: cleanDescription } = redactPII(context.description ?? '');

  const userText = [
    `BUSINESS NAME: ${context.vendorName}`,
    context.businessType ? `BUSINESS TYPE: ${context.businessType}` : null,
    context.contactName ? `CONTACT NAME: ${context.contactName}` : null,
    cleanDescription ? `DESCRIPTION: ${cleanDescription}` : null,
  ].filter(Boolean).join('\n');

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), DRAFT_TIMEOUT_MS);

  try {
    const res = await fetch(DRAFT_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: `${SYSTEM_PROMPT_PREFIX}\n\n${ACTION_FRAMING[action]}` }] },
        contents: [{ role: 'user', parts: [{ text: userText }] }],
        generationConfig: { temperature: 0.3, maxOutputTokens: 250 },
      }),
      signal: controller.signal,
    });
    if (!res.ok) return null;

    const body = (await res.json()) as { candidates?: { content?: { parts?: { text?: string }[] } }[] };
    const text = body.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
    return text || null;
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}
