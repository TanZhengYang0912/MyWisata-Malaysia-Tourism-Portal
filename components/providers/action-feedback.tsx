'use client';

import { createContext, useCallback, useContext, useEffect, useReducer } from 'react';
import { AlertCircle, CheckCircle2, Info, X } from 'lucide-react';
import {
  createFeedbackNotice,
  feedbackReducer,
  type FeedbackNotice,
  type FeedbackTone,
} from '@/lib/feedback/action-feedback';

interface ActionFeedbackContextValue {
  showFeedback: (tone: FeedbackTone, message: string, duration?: number) => void;
}

const ActionFeedbackContext = createContext<ActionFeedbackContextValue | null>(null);

function FeedbackToast({ notice, onDismiss }: { notice: FeedbackNotice; onDismiss: () => void }) {
  useEffect(() => {
    const timer = window.setTimeout(onDismiss, notice.duration);
    return () => window.clearTimeout(timer);
  }, [notice.duration, onDismiss]);

  const styles = {
    success: { container: 'border-emerald-200 bg-emerald-50 text-emerald-900', icon: <CheckCircle2 size={18} className="text-emerald-700" /> },
    error: { container: 'border-red-200 bg-red-50 text-red-900', icon: <AlertCircle size={18} className="text-red-700" /> },
    info: { container: 'border-sky-200 bg-sky-50 text-sky-900', icon: <Info size={18} className="text-sky-700" /> },
  }[notice.tone];

  return (
    <div role={notice.role} className={`flex items-start gap-3 rounded-xl border px-4 py-3 text-sm shadow-lg ${styles.container}`}>
      <span className="mt-0.5 shrink-0">{styles.icon}</span>
      <p className="min-w-0 flex-1 leading-5">{notice.message}</p>
      <button type="button" onClick={onDismiss} aria-label="Dismiss notification" className="shrink-0 rounded-md p-0.5 opacity-60 transition hover:bg-black/5 hover:opacity-100">
        <X size={16} />
      </button>
    </div>
  );
}

export function ActionFeedbackProvider({ children }: { children: React.ReactNode }) {
  const [notices, dispatch] = useReducer(feedbackReducer, []);

  const showFeedback = useCallback((tone: FeedbackTone, message: string, duration?: number) => {
    dispatch({ type: 'add', notice: createFeedbackNotice(tone, message, duration) });
  }, []);

  return (
    <ActionFeedbackContext.Provider value={{ showFeedback }}>
      {children}
      <div className="pointer-events-none fixed right-4 top-4 z-[100] flex w-[min(380px,calc(100vw-2rem))] flex-col gap-2">
        {notices.map((notice) => (
          <div key={notice.id} className="pointer-events-auto">
            <FeedbackToast notice={notice} onDismiss={() => dispatch({ type: 'remove', id: notice.id })} />
          </div>
        ))}
      </div>
    </ActionFeedbackContext.Provider>
  );
}

export function useActionFeedback() {
  const context = useContext(ActionFeedbackContext);
  if (!context) throw new Error('useActionFeedback must be used inside ActionFeedbackProvider');
  return context;
}
