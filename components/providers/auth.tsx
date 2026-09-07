"use client";

// Contract #1: AuthContext — { currentUser, roles, activeVendorId, activeOutletIds }.
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useTranslation } from "react-i18next";
import { setCurrentUserId } from "@/backend/domains/current-user";
import { createClient } from "@/lib/supabase/client";
import { pickDemoRole } from "@/lib/auth/demo-user-role";
import { accountGate, canSuspendedAccessPath } from "@/lib/account/lifecycle";
import { resolveCustomerCapabilities, type CustomerCapabilitySnapshot } from "@/lib/auth/customer-capabilities";
import { isAppLocale } from "@/lib/i18n/locale";
import type { VerificationFacts } from "@/lib/entitlements/types";
import type { Role, User } from "@/backend/core/types";
import type { StaffPermissionKey } from "@/lib/staff-permissions/types";

interface AuthContextValue {
  currentUser: User | null;
  roles: Role[];
  activeVendorId?: string;
  activeOutletIds?: string[];
  activeOutletName?: string;
  capabilities: CustomerCapabilitySnapshot;
  verificationFacts: VerificationFacts | null;
  entitlementGeneration: number;
  staffRoleNames: string[];
  staffPermissionKeys: StaffPermissionKey[];
  loading: boolean;
  switchUser: (id: string, user?: User) => Promise<User | null>;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);
const GUEST_CAPABILITIES = resolveCustomerCapabilities(null);

type AuthMeUser = {
  id: string;
  email: string;
  fullName: string | null;
  tier: User["verificationTier"];
  roles: Role[];
  activeVendorId: string | null;
  activeOutletIds: string[];
  activeOutletName: string | null;
  city: string | null;
  country: string | null;
  preferredLocale: string | null;
  phone: string | null;
  status: User["status"];
  capabilities: CustomerCapabilitySnapshot;
  verificationFacts: VerificationFacts;
  entitlementGeneration: number;
  staffRoleNames: string[];
  staffPermissionKeys: StaffPermissionKey[];
};

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const { t: tAuth } = useTranslation("auth");
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [capabilities, setCapabilities] = useState<CustomerCapabilitySnapshot>(GUEST_CAPABILITIES);
  const [verificationFacts, setVerificationFacts] = useState<VerificationFacts | null>(null);
  const [entitlementGeneration, setEntitlementGeneration] = useState(0);
  const [activeOutletName, setActiveOutletName] = useState<string | null>(null);
  const [staffRoleNames, setStaffRoleNames] = useState<string[]>([]);
  const [staffPermissionKeys, setStaffPermissionKeys] = useState<StaffPermissionKey[]>([]);
  const [loading, setLoading] = useState(true);
  const supabase = useMemo(() => createClient(), []);
  const pathname = usePathname();
  const router = useRouter();

  const loadSupabaseUser = useCallback(async (authUserId: string) => {
    const response = await fetch("/api/auth/me", { cache: "no-store" });
    if (!response.ok) throw new Error(tAuth("errors.generic"));
    const body = await response.json() as { user?: AuthMeUser };
    const row = body.user;
    if (!row || row.id !== authUserId) throw new Error(tAuth("errors.generic"));

    const role = pickDemoRole(row.roles.map((name) => ({ roles: { name } })));
    const name = row.fullName ?? row.email ?? tAuth("userFallback");
    const user: User = {
      id: row.id,
      name,
      email: row.email,
      role,
      avatarInitial: name[0]?.toUpperCase() ?? "?",
      city: row.city ?? undefined,
      country: row.country ?? undefined,
      preferredLocale: isAppLocale(row.preferredLocale) ? row.preferredLocale : undefined,
      phone: row.phone ?? undefined,
      status: (row.status ?? "active") as User["status"],
      verificationTier: (row.tier ?? "email_unverified") as User["verificationTier"],
      verificationFacts: row.verificationFacts,
      entitlementGeneration: row.entitlementGeneration,
      staffRoleNames: row.staffRoleNames,
      staffPermissionKeys: row.staffPermissionKeys,
      vendorId: row.activeVendorId ?? undefined,
      outletId: row.activeOutletIds[0] ?? undefined,
    };
    setCurrentUser(user);
    setCapabilities(row.capabilities);
    setVerificationFacts(row.verificationFacts);
    setEntitlementGeneration(row.entitlementGeneration);
    setActiveOutletName(row.activeOutletName);
    setStaffRoleNames(row.staffRoleNames);
    setStaffPermissionKeys(row.staffPermissionKeys);
    setCurrentUserId(authUserId);
    return user;
  }, [tAuth]);

  useEffect(() => {
    let active = true;

    async function load() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!active) return;
      if (!user) {
        // Do not trust the old localStorage-only demo selection. Server pages
        // authenticate through Supabase cookies, so both sides must agree.
        setCurrentUser(null);
        setCapabilities(GUEST_CAPABILITIES);
        setVerificationFacts(null);
        setEntitlementGeneration(0);
        setActiveOutletName(null);
        setStaffRoleNames([]);
        setStaffPermissionKeys([]);
        setLoading(false);
        return;
      }
      await loadSupabaseUser(user.id);
      if (active) setLoading(false);
    }

    load().catch(() => {
      if (!active) return;
      setCurrentUser(null);
      setCapabilities(GUEST_CAPABILITIES);
      setVerificationFacts(null);
      setEntitlementGeneration(0);
      setActiveOutletName(null);
      setStaffRoleNames([]);
      setStaffPermissionKeys([]);
      setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!session?.user) {
        setCurrentUser(null);
        setCapabilities(GUEST_CAPABILITIES);
        setVerificationFacts(null);
        setEntitlementGeneration(0);
        setStaffRoleNames([]);
        setStaffPermissionKeys([]);
        setLoading(false);
        return;
      }
      void loadSupabaseUser(session.user.id)
        .catch(() => {
          if (!active) return;
          setCurrentUser(null);
          setCapabilities(GUEST_CAPABILITIES);
          setVerificationFacts(null);
          setEntitlementGeneration(0);
          setActiveOutletName(null);
          setStaffRoleNames([]);
          setStaffPermissionKeys([]);
        })
        .finally(() => {
          if (active) setLoading(false);
        });
    });

    return () => {
      active = false;
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
    if (!user || user.id !== id) throw new Error(tAuth('errors.demoLoad'));

    const response = await fetch('/api/auth/demo-signin', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: user.email }),
    });
    await response.json().catch(() => null);
    if (!response.ok) throw new Error(tAuth('signIn.error'));

    const loadedUser = await loadSupabaseUser(id);
    setLoading(false);
    return loadedUser;
  }, [loadSupabaseUser, tAuth]);

  const refreshUser = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (user) await loadSupabaseUser(user.id);
  }, [loadSupabaseUser, supabase]);

  const value: AuthContextValue = {
    currentUser,
    roles: currentUser ? [currentUser.role] : [],
    activeVendorId: currentUser?.vendorId,
    activeOutletIds: currentUser?.outletId ? [currentUser.outletId] : undefined,
    activeOutletName: activeOutletName ?? undefined,
    capabilities,
    verificationFacts,
    entitlementGeneration,
    staffRoleNames,
    staffPermissionKeys,
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
export function useRequireRole(
  allowed: Role[],
  options?: { allowUnauthenticated?: boolean | ((pathname: string) => boolean) },
): AuthContextValue {
  const auth = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const allowUnauthenticated = typeof options?.allowUnauthenticated === "function"
    ? options.allowUnauthenticated(pathname)
    : options?.allowUnauthenticated === true;

  useEffect(() => {
    if (auth.loading) return;
    if (!auth.currentUser && allowUnauthenticated) return;
    if (!auth.currentUser || !allowed.includes(auth.currentUser.role)) {
      router.replace(`/login?next=${encodeURIComponent(pathname + window.location.search)}`);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allowUnauthenticated, auth.loading, auth.currentUser?.role, pathname]);

  return auth;
}
