// P4 — Member 4: admin message drafting. CLAUDE-ADMIN-AI.md Part 2, Capability 2.
// Pure generation, no data access — the admin types the specifics (vendor
// name, reason, etc.), the bot never fetches them. callGemini() redacts
// PII from the admin's typed context as a defence-in-depth backstop, even
// though this is expected to be business content, not customer PII.

import { callGemini } from './gemini';

export type DraftType = 'onboarding' | 'rejection' | 'approval' | 'custom';

const SYSTEM_PROMPT = `You are a staff writing assistant for MyWisata, a Malaysian tourism platform.
You draft short, professional outbound messages for platform staff to review, edit, and send
themselves — you never send anything. Write only the message body, no subject line, no commentary,
no placeholders in brackets other than ones the admin's own context left unresolved.
Plain, courteous, professional English. Keep it concise.`;

const TYPE_GUIDANCE: Record<DraftType, string> = {
  onboarding:
    'Draft a welcoming vendor onboarding message. Cover: welcome, next steps to get their first ' +
    'listing live, and where to get help. Warm but professional.',
  rejection:
    'Draft a vendor/recommendation rejection notice. Be respectful and specific about the reason ' +
    'given, and — where reasonable — note that they may resubmit after addressing it. Do not be ' +
    'harsh or vague.',
  approval:
    'Draft a recommendation/vendor approval message. Congratulatory, brief, and states the ' +
    'concrete next step.',
  custom:
    'Draft the message described in the context below, matching a professional platform-staff tone.',
};

/**
 * Generates an editable draft. Throws on LLM failure — the route is
 * responsible for turning that into an "assistant unavailable" response,
 * per CLAUDE-ADMIN-AI.md's "no keyword fallback for this bot" instruction.
 */
export async function generateDraft(type: DraftType, context: string): Promise<string> {
  const userText = `${TYPE_GUIDANCE[type]}\n\nCONTEXT FROM ADMIN:\n${context}`;
  return callGemini(SYSTEM_PROMPT, userText, { temperature: 0.4, maxOutputTokens: 400 });
}
