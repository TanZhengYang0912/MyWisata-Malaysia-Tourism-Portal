import { z } from 'zod';
import type { AdminKycSubmission, User } from '@/backend/core/types';

export const KYC_PAGE_SIZES = [10, 25, 50] as const;
export const kycQueueQuerySchema = z.object({
  page: z.coerce.number().int().min(1).max(1000000).default(1),
  pageSize: z.coerce.number().int().refine((value) => KYC_PAGE_SIZES.includes(value as 10 | 25 | 50)).default(10),
  status: z.enum(['all', 'pending', 'info_requested']).default('all'),
  assignment: z.enum(['all', 'mine', 'unassigned']).default('all'),
  search: z.string().trim().max(200).default(''),
});

export type KycQueueSubmission = AdminKycSubmission & { assignedTo: string | null };
export type KycReviewCandidate = {
  submissionId: string;
  name: string;
  docType: string;
  submittedAt: string;
  isAssignedToCurrentUser: boolean;
};
export type KycQueueResult = {
  submissions: KycQueueSubmission[];
  customers: Pick<User, 'id' | 'name' | 'email' | 'verificationTier'>[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  counts: { pending: number; infoRequested: number };
  verifiedCount: number;
  oldestPendingAt: string | null;
};

export const kycWorkSchema = z.object({
  action: z.enum(['next', 'release', 'start', 'pause']),
  submissionId: z.string().uuid().optional(),
  expectedVersion: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER).optional(),
  sessionId: z.string().uuid().optional(),
}).strict().refine((value) => value.action === 'next' || (Boolean(value.submissionId) && value.expectedVersion !== undefined))
  .refine((value) => value.action !== 'pause' || Boolean(value.sessionId));

export type KycOperations = {
  submittedToday: number; decidedToday: number; assigned: number; waitingP95Seconds: number | null;
  privateOcrConfigured: boolean;
  sessions: { recorded: number; closed: number; incomplete: number; recordedSeconds: number;
    firstReviewMeanSeconds: number | null; reReviewMeanSeconds: number | null };
  precheck: { queued: number; processing: number; failed: number; completedToday: number };
};
