"use client";

// P4 — Member 4: Share button. See CLAUDE.md Step 3, generalised per
// CLAUDE-SHARE-SURFACES.md §12.1 to cover every shareable content type, not
// just products. Same component, same sharing behaviour (native share sheet
// + copy fallback, affiliate-code embedding, ?src= platform tagging,
// share_events logging) — only what it points at changed.

import { useState } from "react";
import { Share2 } from "lucide-react";
import { useAuth } from "@/components/providers/auth";
import { createClient } from "@/lib/supabase/client";
import { isKycApproved } from "@/lib/affiliate/verification";
import { useActionFeedback } from "@/components/providers/action-feedback";
import { Button } from "@/components/ui/button";

export type ShareType = "product" | "vendor" | "outlet" | "recommendation";

interface ShareButtonProps {
  shareType: ShareType;
  contentId: string;
  /** Used as the native share sheet's title. */
  title: string;
  /**
   * The path segment for both the direct page URL and the affiliate
   * redirect. Product shares can omit it — the component resolves the
   * product's own slug (unchanged behaviour: Activity/ComputedActivity
   * doesn't carry it — see resolveSlug below). Every other shareType has no
   * shared "slug" table to look one up from generically, so callers must
   * pass it themselves (outlets currently key by id, not a slug — see
   * DIRECT_PATH).
   */
  slug?: string;
  /**
   * CLAUDE-SHARE-SURFACES.md Surface 3: listing cards need "an icon, not a
   * big button" so a dense grid doesn't clutter up. Same sharing logic,
   * different chrome — a small icon-only button (sized to match the
   * existing wishlist heart icon) with feedback via the app's existing
   * toast provider instead of inline status text, since a grid card has no
   * room to reserve for it without causing layout shift.
   */
  compact?: boolean;
}

// CLAUDE-SHARE-SURFACES.md Surface 4 (not yet built — see lib/affiliate/redirect.ts):
// the redirect still only resolves product slugs today. A vendor/outlet/
// recommendation share already logs correctly and still sets the
// attribution cookie, but until the redirect learns the `type` param it
// falls back to /customer/explore instead of landing on the right page.
const DIRECT_PATH: Record<ShareType, (id: string) => string> = {
  product: (id) => `/customer/activity/${id}`,
  // No separate vendor page exists — outlets ARE the public storefront.
  vendor: (id) => `/customer/outlet/${id}`,
  outlet: (id) => `/customer/outlet/${id}`,
  // No per-post detail route exists yet (Member 3's recommendations page is
  // list-only) — points at the list until one exists.
  recommendation: () => `/customer/recommendations`,
};

type ShareStatus = "idle" | "working" | "shared" | "copied" | "error";

export function ShareButton({ shareType, contentId, title, slug, compact = false }: ShareButtonProps) {
  const { currentUser } = useAuth();
  const { showFeedback } = useActionFeedback();
  const [status, setStatus] = useState<ShareStatus>("idle");
  const isVerified = isKycApproved(currentUser);

  async function logShare(platform: "native" | "copy_link") {
    try {
      await fetch("/api/shares", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ shareType, contentId, platform }),
      });
    } catch {
      // best-effort — a logging failure must never undo the share the user already completed
    }
  }

  async function resolveSlug(): Promise<string | null> {
    if (slug) return slug;
    if (shareType !== "product") return null;
    // Preserved from the original component: products has a public-read RLS
    // policy, so the plain browser client can read it directly.
    const supabase = createClient();
    const { data: product } = await supabase.from("products").select("slug").eq("id", contentId).maybeSingle();
    return product?.slug ?? null;
  }

  async function buildShareUrl(): Promise<string> {
    const origin = window.location.origin;
    const plainUrl = `${origin}${DIRECT_PATH[shareType](contentId)}`;
    if (!isVerified) return plainUrl;

    try {
      const res = await fetch("/api/affiliate/link", { method: "POST" });
      const body = (await res.json()) as { data: { affiliateCode: string } | null };
      if (!res.ok || !body.data) return plainUrl;

      const resolvedSlug = await resolveSlug();
      const pathSegment = resolvedSlug ?? contentId; // outlets/recommendations key by id, not a slug
      // Product stays exactly `/r/{code}/{slug}` — every product link already
      // shared before this change must keep resolving the same way.
      const typeParam = shareType === "product" ? "" : `?type=${shareType}`;
      return `${origin}/r/${body.data.affiliateCode}/${pathSegment}${typeParam}`;
    } catch {
      return plainUrl;
    }
  }

  // CLAUDE-FUNNEL-AI.md: tags the link with which share method produced it,
  // so /r/[code] can record affiliate_clicks.source (migration 035) and the
  // funnel's per-platform breakdown becomes real going forward. Values match
  // logShare()'s own vocabulary ('native' | 'copy_link') — see
  // lib/affiliate/funnel.ts for why this isn't per-social-network.
  function withSrc(url: string, platform: "native" | "copy_link"): string {
    return `${url}${url.includes("?") ? "&" : "?"}src=${platform}`;
  }

  async function handleShare(event?: React.MouseEvent<HTMLButtonElement>) {
    // Compact instances sit as a sibling over a card's own <Link> (same
    // pattern as the wishlist heart icon on ActivityCard) — stop the click
    // reaching it. Harmless no-op for the standalone (non-card) usage.
    event?.preventDefault();
    event?.stopPropagation();
    if (status === "working") return; // double-press guard
    setStatus("working");
    const url = await buildShareUrl();

    if (typeof navigator.share === "function") {
      try {
        await navigator.share({ title, url: withSrc(url, "native") });
        setStatus("shared");
        if (compact) showFeedback("success", "Shared");
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
      await navigator.clipboard.writeText(withSrc(url, "copy_link"));
      setStatus("copied");
      if (compact) showFeedback("success", "Link copied");
      await logShare("copy_link");
    } catch {
      setStatus("error");
      if (compact) showFeedback("error", "Couldn't copy link");
    }
    setTimeout(() => setStatus("idle"), 2000);
  }

  if (compact) {
    return (
      <button
        type="button"
        onClick={handleShare}
        disabled={status === "working"}
        aria-label={`Share ${title}`}
        title="Share"
        className="flex h-8 w-8 items-center justify-center rounded-full bg-white/90 transition disabled:cursor-wait disabled:opacity-70"
      >
        <Share2 size={14} stroke="#334155" />
      </button>
    );
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
