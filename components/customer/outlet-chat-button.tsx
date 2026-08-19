"use client";

import { MessageCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/providers/auth";

export function OutletChatButton({ outletId }: { outletId: string }) {
  const { currentUser } = useAuth();
  const router = useRouter();

  async function handleChat() {
    if (!currentUser) {
      router.push("/login");
      return;
    }
    const response = await fetch("/api/customer/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ outletId }),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || !payload.data?.id) return;
    router.push(`/customer/chat/${payload.data.id}`);
  }

  return (
    <button
      type="button"
      onClick={handleChat}
      className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-4 py-2 text-sm font-semibold text-white backdrop-blur transition hover:bg-white/25"
    >
      <MessageCircle size={15} /> Chat with vendor
    </button>
  );
}
