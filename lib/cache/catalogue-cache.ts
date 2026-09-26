/**
 * Server-only cached wrappers for public catalogue data.
 *
 * Import these in Server Components and API routes instead of calling
 * getActivities() / getOutlets() directly, so that multiple requests
 * within the same revalidation window share a single DB round-trip.
 *
 * Uses the service-role client (no cookies) so that unstable_cache can
 * execute without hitting Next.js's "dynamic data source inside cache"
 * restriction. Catalogue data is public — RLS does not filter it by user.
 *
 * IMPORTANT: Only import from server-side code (Server Components, API
 * routes, Server Actions). Never import from client components.
 */
import { unstable_cache } from 'next/cache';
import { createServiceClient } from '@/lib/supabase/service';
import { getActivities, getDiscoveryActivities, getOutlets } from '@/backend/domains/catalogue';
import type { Activity, ComputedActivity, Outlet } from '@/backend/core/types';

/**
 * Cached getActivities — revalidates every 60 seconds.
 * Returns raw Activity[] — suitable for catalogue maps (e.g. checkout prepare).
 */
export const getCachedActivities: () => Promise<Activity[]> = unstable_cache(
  async () => {
    const db = createServiceClient();
    return getActivities(db);
  },
  ['catalogue-activities'],
  { revalidate: 60, tags: ['activities'] },
);

/**
 * Cached narrow discovery catalogue with each product's representative outlet.
 * Checkout/detail consumers keep using the complete catalogue selectors.
 * Revalidates every 60 seconds.
 */
export const getCachedComputedActivities: () => Promise<ComputedActivity[]> = unstable_cache(
  async () => {
    const db = createServiceClient();
    return getDiscoveryActivities(db);
  },
  ['catalogue-computed-activities'],
  { revalidate: 60, tags: ['activities'] },
);

/**
 * Cached getOutlets — revalidates every 60 seconds.
 */
export const getCachedOutlets: () => Promise<Outlet[]> = unstable_cache(
  async () => {
    const db = createServiceClient();
    return getOutlets(db);
  },
  ['catalogue-outlets'],
  { revalidate: 60, tags: ['outlets'] },
);
