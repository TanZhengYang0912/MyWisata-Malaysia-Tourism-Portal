import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock('@/components/ui/button', () => ({ Button: (props: React.ComponentProps<'button'>) => <button {...props} /> }));

import { TicketThread } from '../ticket-thread';

describe('support ticket attachment rendering', () => {
  it('loads images lazily through the authorized same-origin endpoint', () => {
    const markup = renderToStaticMarkup(
      <TicketThread
        ticketId="ticket-1"
        ticketIsMine={true}
        ticketBody="Question"
        ticketCreatedAt="2026-11-12T00:00:00.000Z"
        replies={[
          {
            id: 'reply-image',
            is_mine: false,
            sender_role: 'admin',
            body: 'See the attached image.',
            created_at: '2026-11-12T00:01:00.000Z',
            attachment_type: 'image',
          },
          {
            id: 'reply-document',
            is_mine: false,
            sender_role: 'admin',
            body: 'The document is attached.',
            created_at: '2026-11-12T00:02:00.000Z',
            attachment_type: 'document',
          },
        ]}
      />,
    );

    expect(markup).toContain('loading="lazy"');
    expect(markup).toContain('src="/api/support/tickets/ticket-1/attachments/reply-image?retry=0"');
    expect(markup).not.toContain('ticket-attachments');
    expect(markup).not.toContain('signedUrl');
    expect(markup).not.toContain('storage_path');
  });
});
