import { createBrowserClient } from "@supabase/ssr";

// Uses createBrowserClient so cookie-based auth sessions are included in RLS checks
export const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
);
