import { createBrowserClient } from '@supabase/ssr';

// Singleton: multiple createBrowserClient() calls on the same storage key
// trigger Supabase's "Multiple GoTrueClient instances" warning and risk
// desynced sessions. Every browser caller must share this one instance.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let client: ReturnType<typeof createBrowserClient<any>> | undefined;

export function createClient() {
  if (!client) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    client = createBrowserClient<any>(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    );
  }
  return client;
}
