import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock('@/components/ui/button', () => ({ Button: (props: React.ComponentProps<'button'>) => <button {...props} /> }));

import { ApiErrorNotice, copyRequestId } from '../api-error-notice';

describe('API error reference display', () => {
  it('shows selectable request reference text and a copy control', () => {
    const markup = renderToStaticMarkup(<ApiErrorNotice message="The service is unavailable" requestId="req-123" />);

    expect(markup).toContain('The service is unavailable');
    expect(markup).toContain('req-123');
    expect(markup).toContain('errors.copyReferenceId');
    expect(markup).toContain('role="alert"');
  });

  it('copies the request reference through the browser clipboard API', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);

    await copyRequestId('req-123', { writeText });

    expect(writeText).toHaveBeenCalledWith('req-123');
  });
});
