"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/providers/auth";
import { roleHomePath } from "@/lib/auth/post-login-destination";

// The proxy normally redirects `/` before this renders; this client redirect
// remains the fallback when its role lookup fails.
export default function RootEntry() {
  const { currentUser, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;
    router.replace(currentUser ? roleHomePath(currentUser.role) ?? "/login" : "/customer");
  }, [loading, currentUser, router]);

  return null;
}
