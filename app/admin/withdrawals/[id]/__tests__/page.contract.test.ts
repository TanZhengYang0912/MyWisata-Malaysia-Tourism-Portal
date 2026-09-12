import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const pagePath = 'app/admin/withdrawals/[id]/page.tsx';
const componentPath = 'components/admin/withdrawal-review-detail.tsx';
const pageSource = existsSync(pagePath) ? readFileSync(pagePath, 'utf8') : '';
const componentSource = existsSync(componentPath) ? readFileSync(componentPath, 'utf8') : '';

describe('withdrawal stable detail route', () => {
  it('uses the shared Admin shell and a dedicated detail component', () => {
    expect(pageSource).toContain('AdminPageShell');
    expect(pageSource).toContain('AdminPageHeader');
    expect(pageSource).toContain('WithdrawalReviewDetail');
  });

  it('owns evidence, settlement polling, and governed single-request decisions', () => {
    expect(componentSource).toContain('/api/admin/withdrawals/${withdrawalId}');
    expect(componentSource).toContain('detail.availableActions');
    expect(componentSource).toContain('detail.settlementProof');
    expect(componentSource).toContain('detail.reviewSources');
    expect(componentSource).toContain('setInterval');
    expect(componentSource).toContain('/${nextAction}');
    expect(componentSource).not.toContain('AdminBatchActionBar');
  });

  it('reviews rejection reasons through Gemini while other decisions retain direct confirmation', () => {
    expect(componentSource).toContain('type AssistantReview');
    expect(componentSource).toContain('const [reviewingReason, setReviewingReason] = useState(false)');
    expect(componentSource).toContain('/review-reason');
    expect(componentSource).toContain('moderationCredential');
    expect(componentSource).toContain('advisoryAccepted');
    expect(componentSource).toContain('setAssistantReview(null)');
    expect(componentSource).toContain('withdrawals.assistant.continueAnyway');
    expect(componentSource).toContain('withdrawals.assistant.returnToEdit');
    expect(componentSource).toContain('if (selectedDecision !== "reject")');
  });
});
