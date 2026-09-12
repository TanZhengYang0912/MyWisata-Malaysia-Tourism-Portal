import 'server-only';

import type { WalletReasonAction } from '@/lib/validation/wallet-reason-schemas';

export type ModerationResult =
  | { flagged: false }
  | { flagged: true; categories: string[] }
  | { error: 'api_unavailable' };

export type AccountModerationContext =
  | 'suspend_reason'
  | 'soft_delete_reason'
  | 'unsuspend_reason'
  | 'suspension_appeal'
  | 'wallet_adjustment_reason'
  | 'withdrawal_reject_reason'
  | 'withdrawal_hold_reason'
  | 'withdrawal_approve_note'
  | 'withdrawal_fraud_override_reason'
  | 'wallet_settings_reason'
  | 'wallet_approver_role_reason';

export type WalletModerationResult =
  | {
    flagged: boolean;
    relevant: boolean;
    professional: boolean;
    categories: string[];
    advisoryMessage: string | null;
  }
  | { error: 'api_unavailable' };

function contextDescription(context: AccountModerationContext): string {
  switch (context) {
    case 'suspend_reason': return 'an administrator suspension reason';
    case 'soft_delete_reason': return 'an administrator account-closure reason';
    case 'unsuspend_reason': return 'an administrator unsuspension reason';
    case 'suspension_appeal': return 'a user account-suspension appeal';
    case 'wallet_adjustment_reason': return 'a Super Admin wallet adjustment reason';
    case 'withdrawal_reject_reason': return 'a Wallet Approver withdrawal rejection reason';
    case 'withdrawal_hold_reason': return 'a Wallet Approver withdrawal hold reason';
    case 'withdrawal_approve_note': return 'a Wallet Approver withdrawal approval note';
    case 'withdrawal_fraud_override_reason': return 'a Super Admin withdrawal fraud override reason';
    case 'wallet_settings_reason': return 'a Super Admin wallet settings change reason';
    case 'wallet_approver_role_reason': return 'a Super Admin Wallet Approver role-change reason';
  }
}

async function moderateText(text: string, promptLabel: string): Promise<ModerationResult> {
  const apiKey = process.env.GOOGLE_AI_KEY;
  if (!apiKey) {
    return { error: 'api_unavailable' };
  }

  let res: Response;
  try {
    const model = process.env.GEMINI_MODEL ?? 'gemini-3.1-flash-lite';
    res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{
            parts: [{
              text: `${promptLabel} You are a content moderator for a Malaysia tourism platform. Determine whether the submitted text violates community guidelines (hate speech, explicit content, spam, harassment, threats, or illegal activity). Do not judge the user's account status or the truth of the request; only flag abusive or prohibited content. Respond with valid JSON only, no markdown. Format: {"flagged": boolean, "categories": string[]}\n\nText: ${JSON.stringify(text)}`,
            }],
          }],
          generationConfig: { responseMimeType: 'application/json' },
        }),
        signal: AbortSignal.timeout(8000),
      },
    );
  } catch {
    return { error: 'api_unavailable' };
  }

  if (!res.ok) {
    const errBody = await res.json().catch(() => ({}));
    console.error('[moderation] Gemini error', res.status, JSON.stringify(errBody));
    return { error: 'api_unavailable' };
  }

  try {
    const data = await res.json() as {
      candidates: Array<{ content: { parts: Array<{ text: string }> } }>;
    };
    const raw = data.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
    const parsed = JSON.parse(raw) as { flagged: boolean; categories?: string[] };
    if (parsed.flagged) {
      return { flagged: true, categories: parsed.categories ?? ['policy_violation'] };
    }
    return { flagged: false };
  } catch {
    return { error: 'api_unavailable' };
  }
}

export async function moderateBio(text: string): Promise<ModerationResult> {
  return moderateText(text, 'Analyze the following public profile bio.');
}

export async function moderateAccountText(
  text: string,
  context: AccountModerationContext,
): Promise<ModerationResult> {
  return moderateText(text, `Analyze the following ${contextDescription(context)}.`);
}

/**
 * Wallet reasons use a stricter policy than Bio/Appeal text: the model must
 * check both prohibited content and whether the explanation is relevant to
 * the selected Wallet action/category. It never decides whether the
 * underlying financial decision is true or correct.
 */
export async function moderateWalletReason(
  text: string,
  action: WalletReasonAction,
  reasonCategory: string,
): Promise<WalletModerationResult> {
  const apiKey = process.env.GOOGLE_AI_KEY;
  if (!apiKey) return { error: 'api_unavailable' };

  const model = process.env.GEMINI_MODEL ?? 'gemini-3.1-flash-lite';
  const prompt = [
    `Analyze a Wallet administrator ${action} reason for the category ${reasonCategory}.`,
    'You moderate a Malaysia tourism platform.',
    'Set flagged=true for hate speech, discrimination, explicit sexual content, spam, advertising, scams, harassment, insults, threats, violence, or instructions for illegal activity.',
    'Set relevant=true only when the explanation is specific and materially related to the selected Wallet action and category.',
    'Set professional=true only when the explanation is respectful, neutral, clear, and suitable for communication to a customer.',
    'When the text is safe but irrelevant or unprofessional, provide one concise improvement in advisoryMessage; otherwise use null.',
    'Do not decide whether the administrator is factually correct and do not judge the account status; only judge prohibited content and reason relevance.',
    'Respond with valid JSON only, no markdown: {"flagged": boolean, "relevant": boolean, "professional": boolean, "categories": string[], "advisoryMessage": string | null}.',
    `Text: ${JSON.stringify(text)}`,
  ].join(' ');

  let response: Response;
  try {
    response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { responseMimeType: 'application/json' },
        }),
        signal: AbortSignal.timeout(8000),
      },
    );
  } catch {
    return { error: 'api_unavailable' };
  }

  if (!response.ok) {
    const errorBody = await response.json().catch(() => ({}));
    console.error('[moderation] Gemini Wallet-reason error', response.status, JSON.stringify(errorBody));
    return { error: 'api_unavailable' };
  }

  try {
    const data = await response.json() as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    };
    const raw = data.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
    const parsed = JSON.parse(raw) as {
      flagged?: unknown;
      relevant?: unknown;
      professional?: unknown;
      categories?: unknown;
      advisoryMessage?: unknown;
    };
    if (
      typeof parsed.flagged !== 'boolean' ||
      typeof parsed.relevant !== 'boolean' ||
      typeof parsed.professional !== 'boolean' ||
      !Array.isArray(parsed.categories) ||
      parsed.categories.some((category) => typeof category !== 'string') ||
      (parsed.advisoryMessage !== null && typeof parsed.advisoryMessage !== 'string') ||
      (typeof parsed.advisoryMessage === 'string' && parsed.advisoryMessage.length > 300)
    ) {
      return { error: 'api_unavailable' };
    }
    return {
      flagged: parsed.flagged,
      relevant: parsed.relevant,
      professional: parsed.professional,
      categories: parsed.categories,
      advisoryMessage: parsed.advisoryMessage,
    };
  } catch {
    return { error: 'api_unavailable' };
  }
}
