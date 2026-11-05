import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key, i18n: { language: 'en' } }) }));
vi.mock('@/backend/supabase', () => ({ supabase: {} }));

import { WithdrawalHistory } from '../withdrawal-list';

describe('customer withdrawal history', () => {
  it('shows a separate accessible loading section before the page is fetched', () => {
    const markup = renderToStaticMarkup(<WithdrawalHistory userId="customer-1" />);

    expect(markup).toContain('ui.wallet.withdrawalHistory.title');
    expect(markup).toContain('role="status"');
    expect(markup).toContain('ui.wallet.withdrawalHistory.loading');
    expect(markup).not.toContain('customer-1');
    expect(markup).not.toContain('ui.wallet.noTransactions');
  });
});
