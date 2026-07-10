"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Globe, RotateCcw } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { getUsers } from "@/lib/db/repos/identity";
import { resetDemo } from "@/lib/db";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { Role, User } from "@/lib/types";

const HOME_BY_ROLE: Record<Role, string> = {
  customer: "/explore",
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
  const [users, setUsers] = useState<User[]>([]);

  useEffect(() => {
    setUsers(getUsers());
  }, []);

  function pick(user: User) {
    switchUser(user.id);
    router.push(HOME_BY_ROLE[user.role]);
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
            <p className="text-sm text-muted-foreground mb-4">No password needed — this is a mock-auth demo. Pick a seeded role to continue.</p>
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
                    <p className="text-xs text-muted-foreground truncate">{user.email}</p>
                  </div>
                  <Badge variant="secondary" className="shrink-0">{ROLE_LABEL[user.role]}</Badge>
                </button>
              ))}
            </div>
          </CardContent>
        </Card>

        <Button variant="ghost" size="sm" className="mt-4 w-full text-muted-foreground" onClick={() => resetDemo()}>
          <RotateCcw size={13} /> Reset demo data
        </Button>
      </div>
    </div>
  );
}
