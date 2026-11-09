'use client';

import { createContext, useContext } from 'react';
import type { AdminDashboardSummary } from '@/lib/admin/queue-summary';

type AdminQueueSummaryContextValue = {
  summary: AdminDashboardSummary | null;
  error: boolean;
  refresh: () => void;
};

const AdminQueueSummaryContext = createContext<AdminQueueSummaryContextValue>({ summary: null, error: false, refresh: () => undefined });

export const AdminQueueSummaryProvider = AdminQueueSummaryContext.Provider;

export function useAdminQueueSummary() {
  return useContext(AdminQueueSummaryContext);
}
