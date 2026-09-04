"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/providers/auth";

const HOME_BY_ROLE: Record<string, string> = {
  customer: "/customer",
  vendor_owner: "/vendor/dashboard",
  outlet_manager: "/vendor/dashboard",
  admin: "/admin/dashboard",
  approver: "/admin/withdrawals",
  super_admin: "/admin/dashboard",
};

export default function RootEntry() {
  const { currentUser, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;
    router.replace(currentUser ? HOME_BY_ROLE[currentUser.role] ?? "/login" : "/login");
  }, [loading, currentUser, router]);

  return null;
}
