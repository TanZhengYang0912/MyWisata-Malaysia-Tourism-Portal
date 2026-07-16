import 'server-only';

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
  | 'withdrawal_fraud_override_reason';

function contextDescription(context: AccountModerationContext): string {
  switch (context) {
    case 'suspend_reason': return 'an administrator suspension reason';
    case 'soft_delete_reason': return 'an administrator account-closure reason';
    case 'unsuspend_reason': return 'an administrator unsuspension reason';
    case 'suspension_appeal': return 'a user account-suspension appeal';
    case 'wallet_adjustment_reason': return 'a Super Admin wallet adjustment reason';
    case 'withdrawal_reject_reason': return 'a Wallet Approver withdrawal rejection reason';
    case 'withdrawal_hold_reason': return 'a Wallet Approver withdrawal hold reason';
    case 'withdrawal_fraud_override_reason': return 'a Super Admin withdrawal fraud override reason';
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
