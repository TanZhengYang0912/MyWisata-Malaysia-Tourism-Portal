"use client";

// Contract #1: AuthContext — { currentUser, roles, activeVendorId, activeOutletIds }.
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { setCurrentUserId } from "@/backend/domains/current-user";
import { createClient } from "@/lib/supabase/client";
import type { Role, User } from "@/backend/core/types";

interface AuthContextValue {
  currentUser: User | null;
  roles: Role[];
  activeVendorId?: string;
  activeOutletIds?: string[];
  loading: boolean;
  switchUser: (id: string, user?: User) => Promise<void>;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const supabase = useMemo(() => createClient(), []);

  const loadSupabaseUser = useCallback(async (authUserId: string) => {
    const { data: row, error } = await supabase
      .from("users")
      .select("id,email,full_name,city,phone,kyc_status,user_roles(vendor_id,outlet_id,roles(name),outlets(vendor_id))")
      .eq("id", authUserId)
      .maybeSingle();
    if (error) throw error;

    const assignments = row?.user_roles ?? [];
    const assignment = assignments.find((item: any) => {
      const role = Array.isArray(item.roles) ? item.roles[0] : item.roles;
      return role?.name === 'vendor_owner';
    }) ?? assignments[0];
    const assignmentRole = Array.isArray(assignment?.roles) ? assignment.roles[0] : assignment?.roles;
    const assignmentOutlet = Array.isArray((assignment as any)?.outlets) ? (assignment as any).outlets[0] : (assignment as any)?.outlets;
    const vendorId = assignment?.vendor_id ?? assignmentOutlet?.vendor_id;
    const name = row?.full_name ?? row?.email ?? "User";
    const user: User | null = row ? {
      id: row.id,
      name,
      email: row.email,
      role: (assignmentRole?.name ?? "customer") as Role,
      avatarInitial: name[0]?.toUpperCase() ?? "?",
      city: row.city ?? undefined,
      phone: row.phone ?? undefined,
      verificationTier: row.kyc_status as User["verificationTier"],
      vendorId: vendorId ?? undefined,
      outletId: assignment?.outlet_id ?? undefined,
    } : null;
    setCurrentUser(user ?? null);
    if (user) setCurrentUserId(authUserId);
    return user ?? null;
  }, [supabase]);

  useEffect(() => {
    let active = true;

    async function load() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!active) return;
      if (!user) {
        // Do not trust the old localStorage-only demo selection. Server pages
        // authenticate through Supabase cookies, so both sides must agree.
        setCurrentUser(null);
        setLoading(false);
        return;
      }
      await loadSupabaseUser(user.id);
      if (active) setLoading(false);
    }

    load().catch(() => {
      if (!active) return;
      setCurrentUser(null);
      setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!session?.user) {
        setCurrentUser(null);
        setLoading(false);
        return;
      }
      loadSupabaseUser(session.user.id).finally(() => setLoading(false));
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, [loadSupabaseUser, supabase]);

  const switchUser = useCallback(async (id: string, selectedUser?: User) => {
    const user = selectedUser;
    if (!user || user.id !== id) throw new Error('Demo account is unavailable');

    const response = await fetch('/api/auth/demo-signin', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: user.email }),
    });
    const result = await response.json() as { error?: string };
    if (!response.ok) throw new Error(result.error || 'Unable to sign in');

    setCurrentUserId(id);
    setCurrentUser(user);
  }, []);

  const refreshUser = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (user) await loadSupabaseUser(user.id);
  }, [loadSupabaseUser, supabase]);

  const value: AuthContextValue = {
    currentUser,
    roles: currentUser ? [currentUser.role] : [],
    activeVendorId: currentUser?.vendorId,
    activeOutletIds: currentUser?.outletId ? [currentUser.outletId] : undefined,
    loading,
    switchUser,
    refreshUser,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}

/** Guards a route group: redirects to /login if the current user's role isn't allowed. */
export function useRequireRole(allowed: Role[]): AuthContextValue {
  const auth = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (auth.loading) return;
    if (!auth.currentUser || !allowed.includes(auth.currentUser.role)) {
      router.replace("/login");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auth.loading, auth.currentUser?.role]);

  return auth;
}
