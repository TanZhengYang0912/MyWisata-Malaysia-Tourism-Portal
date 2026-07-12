"use client";

// P4 — Member 4: Share button. See CLAUDE.md Step 3.

import { useState } from "react";
import { Share2 } from "lucide-react";
import { useAuth } from "@/components/providers/auth";
import { createClient } from "@/lib/supabase/client";
import { isKycApproved } from "@/lib/affiliate/verification";
import { Button } from "@/components/ui/button";

interface ShareButtonProps {
  productId: string;
  productName: string;
}

type ShareStatus = "idle" | "working" | "shared" | "copied" | "error";

export function ShareButton({ productId, productName }: ShareButtonProps) {
  const { currentUser } = useAuth();
  const [status, setStatus] = useState<ShareStatus>("idle");
  const isVerified = isKycApproved(currentUser);

  async function logShare(platform: "native" | "copy_link") {
    try {
      await fetch("/api/shares", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productId, platform }),
      });
    } catch {
      // best-effort — a logging failure must never undo the share the user already completed
    }
  }

  async function buildShareUrl(): Promise<string> {
    const origin = window.location.origin;
    const plainUrl = `${origin}/customer/activity/${productId}`;
    if (!isVerified) return plainUrl;

    try {
      const res = await fetch("/api/affiliate/link", { method: "POST" });
      const body = (await res.json()) as { data: { affiliateCode: string } | null };
      if (!res.ok || !body.data) return plainUrl;

      // Activity/ComputedActivity (backend/core/types.ts) doesn't carry the
      // product's slug, and backend/domains/catalogue.ts is off-limits (see
      // CLAUDE.md Section 2) — so resolve it directly here. `products` has a
      // public-read RLS policy, so the plain browser client can read it.
      const supabase = createClient();
      const { data: product } = await supabase
        .from("products")
        .select("slug")
        .eq("id", productId)
        .maybeSingle();

      return product?.slug
        ? `${origin}/r/${body.data.affiliateCode}/${product.slug}`
        : `${origin}/r/${body.data.affiliateCode}`;
    } catch {
      return plainUrl;
    }
  }

  async function handleShare() {
    if (status === "working") return; // double-press guard
    setStatus("working");
    const url = await buildShareUrl();

    if (typeof navigator.share === "function") {
      try {
        await navigator.share({ title: productName, url });
        setStatus("shared");
        await logShare("native");
        setTimeout(() => setStatus("idle"), 2000);
        return;
      } catch (err) {
        if (err instanceof Error && err.name === "AbortError") {
          setStatus("idle"); // user cancelled the native share sheet — leave it alone
          return;
        }
        // any other failure (unsupported context, permission denied, etc.) falls through to copy
      }
    }

    try {
      await navigator.clipboard.writeText(url);
      setStatus("copied");
      await logShare("copy_link");
    } catch {
      setStatus("error");
    }
    setTimeout(() => setStatus("idle"), 2000);
  }

  return (
    <div className="inline-flex flex-col items-center gap-1">
      <Button
        variant="outline"
        size="icon"
        className="w-12 h-12 rounded-full border-2"
        onClick={handleShare}
        disabled={status === "working"}
        title="Share"
      >
        <Share2 size={18} />
      </Button>
      {status === "shared" && <p className="text-xs text-primary">Shared</p>}
      {status === "copied" && <p className="text-xs text-primary">Link copied</p>}
      {status === "error" && <p className="text-xs text-destructive">Couldn&apos;t copy link</p>}
      {!isVerified && (status === "idle" || status === "working") && (
        <p className="text-[10px] text-muted-foreground text-center max-w-20">Verify to earn</p>
      )}
    </div>
  );
}
