import { describe, expect, it } from 'vitest';
import { createFeedbackNotice, feedbackReducer, type FeedbackNotice } from '@/lib/feedback/action-feedback';

describe('action feedback reducer', () => {
  it('adds a visible success notice with an accessible role', () => {
    const notice = createFeedbackNotice('success', 'Product saved.');

    const next = feedbackReducer([], { type: 'add', notice });

    expect(next).toEqual([notice]);
    expect(next[0]).toMatchObject({ tone: 'success', message: 'Product saved.', role: 'status' });
  });

  it('removes only the requested notice', () => {
    const first: FeedbackNotice = createFeedbackNotice('success', 'Saved.');
    const second: FeedbackNotice = createFeedbackNotice('error', 'Could not save.');

    expect(feedbackReducer([first, second], { type: 'remove', id: first.id })).toEqual([second]);
  });
});
