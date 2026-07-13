import { createClient } from "@/lib/supabase/client";

// Shares the one browser client singleton with components/providers/auth.tsx
// so there's a single GoTrue instance and one session for RLS checks.
export const supabase = createClient();
