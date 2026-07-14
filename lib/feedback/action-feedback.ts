export type FeedbackTone = 'success' | 'error' | 'info';

export interface FeedbackNotice {
  id: string;
  tone: FeedbackTone;
  message: string;
  role: 'status' | 'alert';
  duration: number;
}

export type FeedbackAction =
  | { type: 'add'; notice: FeedbackNotice }
  | { type: 'remove'; id: string };

export function createFeedbackNotice(tone: FeedbackTone, message: string, duration = 4500): FeedbackNotice {
  return {
    id: `feedback-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    tone,
    message,
    role: tone === 'error' ? 'alert' : 'status',
    duration,
  };
}

export function feedbackReducer(state: FeedbackNotice[], action: FeedbackAction): FeedbackNotice[] {
  if (action.type === 'add') return [...state, action.notice];
  return state.filter((notice) => notice.id !== action.id);
}
