"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Globe } from "lucide-react";
import { useAuth } from "@/components/providers/auth";
import { createClient } from "@/lib/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { Role, User } from "@/backend/core/types";

type DemoUser = User & { vendorName?: string; outletName?: string };

const HOME_BY_ROLE: Record<Role, string> = {
  customer: "/customer/explore",
  vendor_owner: "/vendor/dashboard",
  outlet_manager: "/vendor/dashboard",
  admin: "/admin/dashboard",
  approver: "/admin/dashboard",
  super_admin: "/admin/dashboard",
};

const ROLE_LABEL: Record<Role, string> = {
  customer: "Customer",
  vendor_owner: "Vendor Owner",
  outlet_manager: "Outlet Manager",
  admin: "Admin",
  approver: "Approver",
  super_admin: "Super Admin",
};

export default function LoginPage() {
  const { switchUser } = useAuth();
  const router = useRouter();
  const [users, setUsers] = useState<DemoUser[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [signingIn, setSigningIn] = useState(false);
  const supabase = createClient();

  useEffect(() => {
    fetch('/api/auth/demo-users')
      .then(async (response) => {
        if (!response.ok) throw new Error('Unable to load demo accounts');
        return response.json() as Promise<DemoUser[]>;
      })
      .then(setUsers)
      .catch((reason) => setError(reason instanceof Error ? reason.message : 'Unable to load demo accounts'));
  }, []);

  async function pick(user: User) {
    setError(null);
    try {
      const signedInUser = await switchUser(user.id, user);
      router.push(HOME_BY_ROLE[signedInUser?.role ?? user.role]);
      router.refresh();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unable to sign in');
    }
  }

  async function signIn(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSigningIn(true);
    const { error: signInError } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    setSigningIn(false);
    if (signInError) {
      setError(signInError.message);
      return;
    }
    router.push('/');
    router.refresh();
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-6 py-12" style={{ backgroundColor: "var(--background)" }}>
      <div className="w-full max-w-md">
        <div className="flex items-center gap-2 justify-center mb-8">
          <div className="w-9 h-9 rounded-xl flex items-center justify-center bg-primary">
            <Globe size={18} className="text-white" />
          </div>
          <span className="font-bold text-xl font-[family-name:var(--font-display)] text-foreground">MyWisata</span>
        </div>

        <Card className="p-2">
          <CardContent className="px-4 pt-2">
            <h1 className="font-bold text-lg text-foreground mb-1">Choose a demo account</h1>
            <p className="text-sm text-muted-foreground mb-4">Sign in with Supabase Auth, or use a seeded account for the prototype walkthrough.</p>
            {error && <p className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
            <form onSubmit={signIn} className="mb-5 space-y-2 rounded-xl border border-border bg-secondary/30 p-3">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Account sign in</p>
              <input type="email" required value={email} onChange={(event) => setEmail(event.target.value)} placeholder="Email" className="h-10 w-full rounded-lg border border-border bg-background px-3 text-sm outline-none focus:border-primary" />
              <input type="password" required value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Password" className="h-10 w-full rounded-lg border border-border bg-background px-3 text-sm outline-none focus:border-primary" />
              <Button type="submit" className="w-full" disabled={signingIn}>{signingIn ? 'Signing in…' : 'Sign in'}</Button>
            </form>
            <div className="mb-2 flex items-center justify-between"><p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Seeded demo accounts</p><span className="text-[11px] text-muted-foreground">Quick entry</span></div>
            <div className="space-y-2">
              {users.map((user) => (
                <button
                  key={user.id}
                  onClick={() => pick(user)}
                  className="w-full flex items-center gap-3 p-3 rounded-xl border border-border hover:bg-secondary transition-colors text-left"
                >
                  <div className="w-9 h-9 rounded-full flex items-center justify-center font-bold text-sm text-white shrink-0 bg-primary">
                    {user.avatarInitial}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-foreground truncate">{user.name}</p>
                    <p className="text-xs text-muted-foreground truncate">{user.vendorName || user.outletName || user.email}</p>
                  </div>
                  <Badge variant="secondary" className="shrink-0">{ROLE_LABEL[user.role]}</Badge>
                </button>
              ))}
            </div>
          </CardContent>
        </Card>

        <p className="mt-4 text-center text-xs text-muted-foreground">Demo records are stored in Supabase. The browser is not used as the database.</p>
      </div>
    </div>
  );
}
