import { createBrowserClient } from '@supabase/ssr';

// Singleton: multiple createBrowserClient() calls on the same storage key
// trigger Supabase's "Multiple GoTrueClient instances" warning and risk
// desynced sessions. Every browser caller must share this one instance.
let client: ReturnType<typeof createBrowserClient<any>> | undefined;

export function createClient() {
  if (!client) {
    client = createBrowserClient<any>(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    );
  }
  return client;
}
