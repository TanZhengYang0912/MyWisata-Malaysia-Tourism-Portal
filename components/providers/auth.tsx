"use client";

// Contract #1: AuthContext — { currentUser, roles, activeVendorId, activeOutletIds }.
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { setCurrentUserId } from "@/backend/domains/current-user";
import { isAppLocale } from "@/lib/i18n/locale";
import { createClient } from "@/lib/supabase/client";
import { pickDemoAssignment } from "@/lib/auth/demo-user-role";
import { accountGate, canSuspendedAccessPath } from "@/lib/account/lifecycle";
import type { Role, User } from "@/backend/core/types";

interface AuthContextValue {
  currentUser: User | null;
  roles: Role[];
  activeVendorId?: string;
  activeOutletIds?: string[];
  loading: boolean;
  switchUser: (id: string, user?: User) => Promise<User | null>;
  refreshUser: () => Promise<User | null>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const supabase = useMemo(() => createClient(), []);
  const profileLoadVersion = useRef(0);
  const switchAttemptVersion = useRef(0);
  const pathname = usePathname();
  const router = useRouter();

  const loadSupabaseUser = useCallback(async (authUserId: string, requestVersion: number) => {
    const { data: row, error } = await supabase
      .from("users")
      .select("id,email,full_name,city,country,preferred_locale,phone,status,tier,user_roles(vendor_id,outlet_id,roles(name),outlets(vendor_id))")
      .eq("id", authUserId)
      .maybeSingle();
    if (requestVersion !== profileLoadVersion.current) return null;
    if (error) throw new Error(error.message || "Unable to load your account profile");

    const assignments = row?.user_roles ?? [];
    const assignment = pickDemoAssignment(assignments as Array<{ roles?: { name?: string | null } | { name?: string | null }[] | null }>) as typeof assignments[number] | undefined;
    const assignmentRole = Array.isArray(assignment?.roles) ? assignment.roles[0] : assignment?.roles;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
      country: row.country ?? undefined,
      preferredLocale: isAppLocale(row.preferred_locale) ? row.preferred_locale : undefined,
      phone: row.phone ?? undefined,
      status: (row.status ?? "active") as User["status"],
      verificationTier: (row.tier ?? "email_unverified") as User["verificationTier"],
      vendorId: vendorId ?? undefined,
      outletId: assignment?.outlet_id ?? undefined,
    } : null;
    setCurrentUser(user ?? null);
    if (user) setCurrentUserId(authUserId);
    return user ?? null;
  }, [supabase]);

  useEffect(() => {
    let active = true;
    const loadVersion = profileLoadVersion;
    const initialRequestVersion = ++profileLoadVersion.current;

    async function load() {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!active || initialRequestVersion !== profileLoadVersion.current) return;
        if (!user) {
          // Do not trust the old localStorage-only demo selection. Server pages
          // authenticate through Supabase cookies, so both sides must agree.
          setCurrentUser(null);
          setLoading(false);
          return;
        }
        await loadSupabaseUser(user.id, initialRequestVersion);
        if (active && initialRequestVersion === profileLoadVersion.current) setLoading(false);
      } catch {
        if (!active || initialRequestVersion !== profileLoadVersion.current) return;
        setCurrentUser(null);
        setLoading(false);
      }
    }

    void load();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      const requestVersion = ++profileLoadVersion.current;
      if (!session?.user) {
        ++switchAttemptVersion.current;
        setCurrentUser(null);
        setLoading(false);
        return;
      }
      setCurrentUser(null);
      setLoading(true);
      window.setTimeout(() => {
        if (!active) return;
        void loadSupabaseUser(session.user.id, requestVersion)
          .catch(() => undefined)
          .finally(() => {
            if (active && requestVersion === profileLoadVersion.current) setLoading(false);
          });
      }, 0);
    });

    return () => {
      active = false;
      ++loadVersion.current;
      subscription.unsubscribe();
    };
  }, [loadSupabaseUser, supabase]);

  useEffect(() => {
    if (loading || !currentUser) return;
    const gate = accountGate(currentUser.status);
    const destination = gate === "restore" ? "/account-restore" : gate === "suspended" ? "/account-suspended" : null;
    const suspendedSupportPath = gate === "suspended" && canSuspendedAccessPath(pathname);
    if (destination && pathname !== destination && !suspendedSupportPath) router.replace(destination);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUser?.status, loading, pathname, router]);

  const switchUser = useCallback(async (id: string, selectedUser?: User) => {
    const user = selectedUser;
    if (!user || user.id !== id) throw new Error('Demo account is unavailable');
    const switchAttempt = ++switchAttemptVersion.current;
    ++profileLoadVersion.current;

    const response = await fetch('/api/auth/demo-signin', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: user.email }),
    });
    const result = await response.json() as {
      error?: string;
      session?: { access_token?: string; refresh_token?: string };
    };
    if (!response.ok) throw new Error(result.error || 'Unable to sign in');
    if (switchAttempt !== switchAttemptVersion.current) return null;
    if (!result.session?.access_token || !result.session.refresh_token) {
      throw new Error('Demo sign-in did not return a session');
    }

    const { data: sessionData, error: sessionError } = await supabase.auth.setSession({
      access_token: result.session.access_token,
      refresh_token: result.session.refresh_token,
    });
    if (sessionError) throw sessionError;
    if (sessionData.user?.id !== id) {
      await supabase.auth.signOut({ scope: "local" });
      throw new Error("Demo sign-in returned a session for a different account");
    }
    if (switchAttempt !== switchAttemptVersion.current) return null;

    const requestVersion = ++profileLoadVersion.current;
    try {
      return await loadSupabaseUser(id, requestVersion);
    } finally {
      if (requestVersion === profileLoadVersion.current) setLoading(false);
    }
  }, [loadSupabaseUser]);

  const refreshUser = useCallback(async () => {
    const requestVersion = ++profileLoadVersion.current;
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (requestVersion !== profileLoadVersion.current) return null;
      return user ? await loadSupabaseUser(user.id, requestVersion) : null;
    } finally {
      if (requestVersion === profileLoadVersion.current) setLoading(false);
    }
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
  const pathname = usePathname();

  useEffect(() => {
    if (auth.loading) return;
    if (!auth.currentUser || !allowed.includes(auth.currentUser.role)) {
      router.replace(`/login?next=${encodeURIComponent(pathname + window.location.search)}`);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auth.loading, auth.currentUser?.role, pathname]);

  return auth;
}
