"use client";

// Contract #1: AuthContext — { currentUser, roles, activeVendorId, activeOutletIds }.
import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useTranslation } from "react-i18next";
import { clearCurrentUser, setCurrentUser as setStoredCurrentUser } from "@/backend/domains/current-user";
import { createClient } from "@/lib/supabase/client";
import { pickDemoRole } from "@/lib/auth/demo-user-role";
import { accountGate, canSuspendedAccessPath } from "@/lib/account/lifecycle";
import { resolveCustomerCapabilities, type CustomerCapabilitySnapshot } from "@/lib/auth/customer-capabilities";
import { isAppLocale } from "@/lib/i18n/locale";
import { staffMfaDestination, staffVerificationDestination } from '@/lib/auth/staff-route-boundaries';
import type { VerificationFacts } from "@/lib/entitlements/types";
import type { Role, User } from "@/backend/core/types";
import type { StaffModule, StaffPermissionKey } from "@/lib/staff-permissions/types";

interface AuthContextValue {
  staffVerified: boolean;
  staffPasskeyRequired: boolean;
  staffMfaRequired: boolean;
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
  staffModules: StaffModule[];
  loading: boolean;
  switchUser: (id: string, user?: User, captchaToken?: string) => Promise<StaffSessionUser | null>;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);
const GUEST_CAPABILITIES = resolveCustomerCapabilities(null);
type StaffSessionUser = User & { staffVerified: boolean; staffPasskeyRequired: boolean; staffMfaRequired: boolean };

type AuthMeUser = {
  staffVerified?: boolean;
  staffPasskeyRequired?: boolean;
  staffMfaRequired?: boolean;
  id: string;
  email: string;
  fullName: string | null;
  avatarUrl: string | null;
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
  staffModules: StaffModule[];
};

type AuthRequest = { generation: number; controller: AbortController };

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const { t: tAuth } = useTranslation("auth");
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [capabilities, setCapabilities] = useState<CustomerCapabilitySnapshot>(GUEST_CAPABILITIES);
  const [verificationFacts, setVerificationFacts] = useState<VerificationFacts | null>(null);
  const [entitlementGeneration, setEntitlementGeneration] = useState(0);
  const [activeOutletName, setActiveOutletName] = useState<string | null>(null);
  const [staffRoleNames, setStaffRoleNames] = useState<string[]>([]);
  const [staffPermissionKeys, setStaffPermissionKeys] = useState<StaffPermissionKey[]>([]);
  const [staffModules, setStaffModules] = useState<StaffModule[]>([]);
  const [staffVerified, setStaffVerified] = useState(false);
  const [staffPasskeyRequired, setStaffPasskeyRequired] = useState(true);
  const [staffMfaRequired, setStaffMfaRequired] = useState(false);
  const [loading, setLoading] = useState(true);
  const supabase = useMemo(() => createClient(), []);
  const pathname = usePathname();
  const router = useRouter();
  const requestGeneration = useRef(0);
  const activeRequest = useRef<AbortController | null>(null);
  const currentUserId = useRef<string | null>(currentUser?.id ?? null);
  useLayoutEffect(() => {
    currentUserId.current = currentUser?.id ?? null;
  }, [currentUser?.id]);

  const beginRequest = useCallback((): AuthRequest => {
    activeRequest.current?.abort();
    const controller = new AbortController();
    const generation = ++requestGeneration.current;
    activeRequest.current = controller;
    return { generation, controller };
  }, []);

  const invalidateRequests = useCallback(() => {
    requestGeneration.current += 1;
    activeRequest.current?.abort();
    activeRequest.current = null;
  }, []);

  const isCurrentRequest = useCallback((request: AuthRequest) => (
    !request.controller.signal.aborted && request.generation === requestGeneration.current
  ), []);

  const clearIdentityState = useCallback(() => {
    clearCurrentUser();
    setCurrentUser(null);
    setStaffVerified(false);
    setStaffPasskeyRequired(true);
    setStaffMfaRequired(false);
    setCapabilities(GUEST_CAPABILITIES);
    setVerificationFacts(null);
    setEntitlementGeneration(0);
    setActiveOutletName(null);
    setStaffRoleNames([]);
    setStaffPermissionKeys([]);
    setStaffModules([]);
  }, []);

  const loadSupabaseUser = useCallback(async (authUserId: string, request = beginRequest()): Promise<StaffSessionUser | null> => {
    if (!isCurrentRequest(request)) return null;
    try {
      const response = await fetch("/api/auth/me", { cache: "no-store", signal: request.controller.signal });
      if (!isCurrentRequest(request)) return null;
      if (!response.ok) throw new Error(tAuth("errors.generic"));
      const body = await response.json() as { user?: AuthMeUser };
      if (!isCurrentRequest(request)) return null;
      const row = body.user;
      if (!row || row.id !== authUserId) throw new Error(tAuth("errors.generic"));

      const role = pickDemoRole(row.roles.map((name) => ({ roles: { name } })));
      const name = row.fullName ?? row.email ?? tAuth("userFallback");
      const user: StaffSessionUser = {
      staffVerified: row.staffVerified === true,
      staffPasskeyRequired: row.staffPasskeyRequired !== false,
      staffMfaRequired: row.staffMfaRequired !== false,
      id: row.id,
      name,
      email: row.email,
      role,
      avatarInitial: name[0]?.toUpperCase() ?? "?",
      avatarUrl: row.avatarUrl ?? null,
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
      staffModules: row.staffModules ?? [],
      vendorId: row.activeVendorId ?? undefined,
      outletId: row.activeOutletIds[0] ?? undefined,
      };
      if (!isCurrentRequest(request)) return null;
      setStoredCurrentUser(user);
      setCurrentUser(user);
      setCapabilities(row.capabilities);
      setVerificationFacts(row.verificationFacts);
      setEntitlementGeneration(row.entitlementGeneration);
      setActiveOutletName(row.activeOutletName);
      setStaffRoleNames(row.staffRoleNames);
      setStaffPermissionKeys(row.staffPermissionKeys);
      setStaffModules(row.staffModules ?? []);
      setStaffVerified(row.staffVerified === true);
      setStaffPasskeyRequired(row.staffPasskeyRequired !== false);
      setStaffMfaRequired(row.staffMfaRequired !== false);
      return user;
    } catch (error) {
      if (!isCurrentRequest(request)) return null;
      throw error;
    } finally {
      if (isCurrentRequest(request)) activeRequest.current = null;
    }
  }, [beginRequest, isCurrentRequest, tAuth]);

  useEffect(() => {
    let active = true;
    const request = beginRequest();

    async function load() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!active || !isCurrentRequest(request)) return;
      if (!user) {
        // Do not trust the old localStorage-only demo selection. Server pages
        // authenticate through Supabase cookies, so both sides must agree.
        clearIdentityState();
        setLoading(false);
        return;
      }
      await loadSupabaseUser(user.id, request);
      if (active && isCurrentRequest(request)) setLoading(false);
    }

    load().catch(() => {
      if (!active || !isCurrentRequest(request)) return;
      clearIdentityState();
      setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      // The explicit getUser() above owns the initial load. Supabase also
      // emits INITIAL_SESSION when this listener subscribes; handling it here
      // would issue a duplicate /api/auth/me request on every app boot.
      if (_event === "INITIAL_SESSION") return;
      const authRequest = beginRequest();
      if (!session?.user) {
        clearIdentityState();
        setLoading(false);
        return;
      }
      const identityChanged = currentUserId.current !== session.user.id;
      if (identityChanged) clearIdentityState();
      // Same-user focus/token refreshes must not unmount guarded page drafts.
      setLoading(identityChanged);
      void loadSupabaseUser(session.user.id, authRequest)
        .catch(() => {
          if (!active || !isCurrentRequest(authRequest)) return;
          clearIdentityState();
        })
        .finally(() => {
          if (active && isCurrentRequest(authRequest)) setLoading(false);
        });
    });

    return () => {
      active = false;
      subscription.unsubscribe();
      invalidateRequests();
    };
  }, [beginRequest, clearIdentityState, invalidateRequests, isCurrentRequest, loadSupabaseUser, supabase]);

  useEffect(() => {
    if (loading || !currentUser) return;
    const gate = accountGate(currentUser.status);
    const destination = gate === "restore" ? "/account-restore" : gate === "suspended" ? "/account-suspended" : null;
    const suspendedSupportPath = gate === "suspended" && canSuspendedAccessPath(pathname);
    if (destination && pathname !== destination && !suspendedSupportPath) router.replace(destination);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUser?.status, loading, pathname, router]);

  const switchUser = useCallback(async (id: string, selectedUser?: User, captchaToken?: string) => {
    const user = selectedUser;
    if (!user || user.id !== id) throw new Error(tAuth('errors.demoLoad'));
    const request = beginRequest();
    setLoading(true);
    clearIdentityState();

    try {
      const response = await fetch('/api/auth/demo-signin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: user.email, captchaToken }),
        signal: request.controller.signal,
      });
      await response.json().catch(() => null);
      if (!isCurrentRequest(request)) return null;
      if (!response.ok) throw new Error(tAuth('signIn.error'));

      const loadedUser = await loadSupabaseUser(id, request);
      if (!loadedUser || !isCurrentRequest(request)) return null;
      setLoading(false);
      return loadedUser;
    } catch {
      if (!isCurrentRequest(request)) return null;
      invalidateRequests();
      await supabase.auth.signOut({ scope: "local" }).catch(() => undefined);
      clearIdentityState();
      setLoading(false);
      throw new Error(tAuth('signIn.error'));
    }
  }, [beginRequest, clearIdentityState, invalidateRequests, isCurrentRequest, loadSupabaseUser, supabase, tAuth]);

  const refreshUser = useCallback(async () => {
    const request = beginRequest();
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!isCurrentRequest(request)) return;
      if (!user) {
        clearIdentityState();
        setLoading(false);
        return;
      }
      const identityChanged = currentUserId.current !== user.id;
      if (identityChanged) clearIdentityState();
      setLoading(identityChanged);
      await loadSupabaseUser(user.id, request);
      if (isCurrentRequest(request)) setLoading(false);
    } catch {
      if (!isCurrentRequest(request)) return;
      clearIdentityState();
      setLoading(false);
    }
  }, [beginRequest, clearIdentityState, isCurrentRequest, loadSupabaseUser, supabase]);

  const value: AuthContextValue = {
    staffVerified,
    staffPasskeyRequired,
    staffMfaRequired,
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
    staffModules,
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
    } else if (pathname === '/staff' || pathname === '/admin' || pathname.startsWith('/admin/')) {
      if (auth.staffMfaRequired) router.replace(staffMfaDestination(pathname + window.location.search));
      else if (auth.staffPasskeyRequired && !auth.staffVerified) router.replace(staffVerificationDestination(pathname + window.location.search));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allowUnauthenticated, auth.loading, auth.currentUser?.role, auth.staffVerified, auth.staffPasskeyRequired, auth.staffMfaRequired, pathname]);

  return auth;
}
