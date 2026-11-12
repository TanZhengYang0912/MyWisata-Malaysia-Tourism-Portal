import type { SupabaseClient, User } from '@supabase/supabase-js';

export type AuthenticatedUserResult =
  | { state: 'authenticated'; user: User }
  | { state: 'unauthenticated' }
  | { state: 'unavailable'; error: unknown };

function isUnauthenticatedAuthError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  if ('name' in error && error.name === 'AuthSessionMissingError') return true;
  return 'status' in error && error.status === 401;
}

/** Distinguishes a missing/expired login from an auth service read failure. */
export async function getAuthenticatedUser(supabase: SupabaseClient): Promise<AuthenticatedUserResult> {
  try {
    const { data, error } = await supabase.auth.getUser();
    if (error) {
      return isUnauthenticatedAuthError(error)
        ? { state: 'unauthenticated' }
        : { state: 'unavailable', error };
    }
    if (!data.user) return { state: 'unauthenticated' };
    return { state: 'authenticated', user: data.user };
  } catch (error) {
    return isUnauthenticatedAuthError(error)
      ? { state: 'unauthenticated' }
      : { state: 'unavailable', error };
  }
}
